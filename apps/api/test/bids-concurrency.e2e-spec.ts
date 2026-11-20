import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { signUp, requiredAnswers } from './helpers';

const prisma = new PrismaClient();
const job = {
  title: 'Заказ для гонок откликов',
  description: 'Проверка параллельных откликов, выбора исполнителя и отзыва.',
  category: 'OTHER',
  details: requiredAnswers('OTHER'),
  city: 'Москва',
};
const bid = { price: 10_000, comment: 'Готов выполнить работу в срок.' };

describe('Bids concurrency (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
  });

  async function jobWithBids(count: number) {
    const customer = await signUp(app, 'CUSTOMER');
    const { body: created } = await http()
      .post('/v1/me/jobs')
      .set(customer.auth)
      .send(job)
      .expect(201);
    const contractors = await Promise.all(
      Array.from({ length: count }, () => signUp(app, 'CONTRACTOR')),
    );
    const bids = [];
    for (const c of contractors) {
      bids.push(
        (await http().post(`/v1/jobs/${created.id}/bids`).set(c.auth).send(bid).expect(201)).body,
      );
    }
    return { customer, jobId: created.id as string, contractors, bids };
  }

  it('parallel accepts of different bids choose exactly one contractor', async () => {
    const { customer, jobId, bids } = await jobWithBids(5);
    const results = await Promise.all(
      bids.map((b) => http().post(`/v1/me/jobs/${jobId}/bids/${b.id}/accept`).set(customer.auth)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    const statuses = (await prisma.bid.findMany()).map((b) => b.status).sort();
    expect(statuses).toEqual(['ACCEPTED', 'REJECTED', 'REJECTED', 'REJECTED', 'REJECTED']);
    expect(await prisma.auditLog.count({ where: { action: 'JOB_STARTED' } })).toBe(1);
  });

  it('accept racing with withdraw never overwrites a withdrawn bid and audits what really happened', async () => {
    for (let round = 0; round < 5; round += 1) {
      await prisma.auditLog.deleteMany();
      await prisma.bid.deleteMany();
      await prisma.job.deleteMany();
      await prisma.user.deleteMany();
      const { customer, jobId, contractors, bids } = await jobWithBids(2);
      const [accept, withdraw] = await Promise.all([
        http().post(`/v1/me/jobs/${jobId}/bids/${bids[0].id}/accept`).set(customer.auth),
        http().post(`/v1/me/bids/${bids[1].id}/withdraw`).set(contractors[1].auth),
      ]);
      expect(accept.status).toBe(200);
      const second = await prisma.bid.findUniqueOrThrow({ where: { id: bids[1].id } });
      const rejectedAudit = await prisma.auditLog.count({
        where: { entityId: bids[1].id, action: 'BID_REJECTED' },
      });
      const withdrawnAudit = await prisma.auditLog.count({
        where: { entityId: bids[1].id, action: 'BID_WITHDRAWN' },
      });
      if (withdraw.status === 200) {
        expect(second.status).toBe('WITHDRAWN');
        expect([rejectedAudit, withdrawnAudit]).toEqual([0, 1]);
      } else {
        expect(withdraw.status).toBe(409);
        expect(second.status).toBe('REJECTED');
        expect([rejectedAudit, withdrawnAudit]).toEqual([1, 0]);
      }
    }
  });

  it('accept racing with withdraw of the same bid has one consistent outcome', async () => {
    for (let round = 0; round < 5; round += 1) {
      await prisma.auditLog.deleteMany();
      await prisma.bid.deleteMany();
      await prisma.job.deleteMany();
      await prisma.user.deleteMany();
      const { customer, jobId, contractors, bids } = await jobWithBids(1);
      const [accept, withdraw] = await Promise.all([
        http().post(`/v1/me/jobs/${jobId}/bids/${bids[0].id}/accept`).set(customer.auth),
        http().post(`/v1/me/bids/${bids[0].id}/withdraw`).set(contractors[0].auth),
      ]);
      const stored = await prisma.bid.findUniqueOrThrow({ where: { id: bids[0].id } });
      const jobStatus = (await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).status;
      // Ровно одно из действий успешно, и состояние ему соответствует.
      expect([accept.status, withdraw.status].sort()).toEqual([200, 409]);
      if (accept.status === 200) {
        expect([stored.status, jobStatus]).toEqual(['ACCEPTED', 'IN_PROGRESS']);
      } else {
        expect([stored.status, jobStatus]).toEqual(['WITHDRAWN', 'OPEN']);
      }
    }
  });

  it('bids racing with acceptance are either rejected with the rest or refused', async () => {
    const { customer, jobId, bids } = await jobWithBids(1);
    const late = await Promise.all(Array.from({ length: 4 }, () => signUp(app, 'CONTRACTOR')));
    const [accept, ...newBids] = await Promise.all([
      http().post(`/v1/me/jobs/${jobId}/bids/${bids[0].id}/accept`).set(customer.auth),
      ...late.map((c) => http().post(`/v1/jobs/${jobId}/bids`).set(c.auth).send(bid)),
    ]);
    expect(accept.status).toBe(200);
    for (const res of newBids) expect([201, 409]).toContain(res.status);
    // После выбора исполнителя на заказе нет ни одного ожидающего отклика.
    expect(await prisma.bid.count({ where: { jobId, status: 'PENDING' } })).toBe(0);
    expect(await prisma.bid.count({ where: { jobId, status: 'ACCEPTED' } })).toBe(1);
  });

  it('parallel repeated bids of one contractor on one job leave exactly one bid', async () => {
    const { jobId } = await jobWithBids(0);
    const contractor = await signUp(app, 'CONTRACTOR');
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        http()
          .post(`/v1/jobs/${jobId}/bids`)
          .set(contractor.auth)
          .send({ ...bid, price: 10_000 + i }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
    expect(await prisma.bid.count({ where: { jobId, contractorId: contractor.id } })).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { actorId: contractor.id, action: 'BID_CREATED' } }),
    ).toBe(1);
  });

  it('parallel bids cannot exceed the daily quota', async () => {
    const customer = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');
    const jobs = await Promise.all(
      Array.from({ length: 34 }, (_, i) =>
        prisma.job.create({
          data: { ...job, title: `Квота ${i}`, category: 'OTHER', ownerId: customer.id },
        }),
      ),
    );
    await prisma.bid.createMany({
      data: jobs.slice(0, 28).map((j) => ({
        jobId: j.id,
        contractorId: contractor.id,
        price: 1,
        comment: 'Отклик для квоты',
      })),
    });
    const results = await Promise.all(
      jobs
        .slice(28)
        .map((j) => http().post(`/v1/jobs/${j.id}/bids`).set(contractor.auth).send(bid)),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 429)).toHaveLength(4);
    expect(await prisma.bid.count({ where: { contractorId: contractor.id } })).toBe(30);
  });

  it('bookmarking a job while its owner chooses a contractor: both succeed, no deadlock', async () => {
    // Ревью garantych-reviewer: «В избранное» брало строку пользователя FOR UPDATE, а выбор
    // исполнителя держит заказ и пишет уведомление этому мастеру (внешний ключ ждёт KEY SHARE
    // на его строке) — цикл, Postgres отменял одну транзакцию, ответ 500.
    const { customer, jobId, contractors, bids } = await jobWithBids(2);
    const [, other] = contractors;
    // Транзакция-«пауза» задаёт порядок: выбор исполнителя заблокирует заказ и встанет на отклике.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const gate = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM bids WHERE id = ${bids[0].id} FOR UPDATE`;
        await held;
      },
      { timeout: 20_000 },
    );
    const accept = http()
      .post(`/v1/me/jobs/${jobId}/bids/${bids[0].id}/accept`)
      .set(customer.auth)
      .then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const bookmark = http()
      .put(`/v1/me/favorites/${jobId}`)
      .set(other.auth)
      .then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 400));
    release();
    await gate;
    expect([(await accept).status, (await bookmark).status]).toEqual([200, 200]);
  });

  it('the chosen contractor deletes the account meanwhile: no deadlock', async () => {
    // Ревью garantych-reviewer: удаление держало строку мастера FOR UPDATE и ждало его отклик,
    // а выбор исполнителя держал отклик и ждал KEY SHARE на строке мастера (уведомление ему) —
    // цикл, Postgres отменял одну транзакцию, ответ 500.
    const { customer, jobId, contractors, bids } = await jobWithBids(1);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const gate = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM bids WHERE id = ${bids[0].id} FOR UPDATE`;
        await held;
      },
      { timeout: 20_000 },
    );
    const accept = http()
      .post(`/v1/me/jobs/${jobId}/bids/${bids[0].id}/accept`)
      .set(customer.auth)
      .then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const remove = http()
      .post('/v1/me/delete')
      .set(contractors[0].auth)
      .send({ password: 'correct-horse-battery' })
      .then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    release();
    await gate;
    // Выбор прошёл первым: заказ в работе, удаление отказывает по делу (409), но не 500.
    expect([(await accept).status, (await remove).status]).toEqual([200, 409]);
  });

  it('a second bid while the owner chooses a contractor: no deadlock', async () => {
    const { customer, jobId, contractors, bids } = await jobWithBids(2);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const gate = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM bids WHERE id = ${bids[0].id} FOR UPDATE`;
        await held;
      },
      { timeout: 20_000 },
    );
    const accept = http()
      .post(`/v1/me/jobs/${jobId}/bids/${bids[0].id}/accept`)
      .set(customer.auth)
      .then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 400));
    // Повторный отклик того же мастера: строка пользователя, затем заказ.
    const again = http()
      .post(`/v1/jobs/${jobId}/bids`)
      .set(contractors[1].auth)
      .send(bid)
      .then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 400));
    release();
    await gate;
    expect((await accept).status).toBe(200);
    // Заказ уже в работе: отказ по делу (409), но не 500.
    expect((await again).status).toBe(409);
  });
});
