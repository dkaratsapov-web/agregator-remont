import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { signUp } from './helpers';

const prisma = new PrismaClient();

const baseJob = {
  title: 'Исходное название заказа',
  description: 'Описание заказа для проверки параллельных изменений.',
  category: 'OTHER',
  city: 'Москва',
};

type Change = { from: unknown; to: unknown };

/** Проверяет, что записи журнала по полю образуют одну непрерывную цепочку from → to. */
function expectContinuousChain(changes: Change[], initial: unknown, final: unknown) {
  const remaining = [...changes];
  let current = initial;
  while (remaining.length > 0) {
    const index = remaining.findIndex((c) => c.from === current);
    expect(index).toBeGreaterThanOrEqual(0); // иначе «было» не совпадает с предыдущим «стало»
    current = remaining[index].to;
    remaining.splice(index, 1);
  }
  expect(current).toBe(final);
}

describe('My jobs concurrency (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.job.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.job.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
  });

  it('parallel PATCHes of one field are serialized: no lost updates, continuous audit chain', async () => {
    const owner = await signUp(app, 'CUSTOMER');
    const { body: job } = await http()
      .post('/v1/me/jobs')
      .set(owner.auth)
      .send(baseJob)
      .expect(201);

    const titles = Array.from({ length: 8 }, (_, i) => `Параллельная правка номер ${i + 1}`);
    const responses = await Promise.all(
      titles.map((title) => http().patch(`/v1/me/jobs/${job.id}`).set(owner.auth).send({ title })),
    );
    expect(responses.map((r) => r.status)).toEqual(titles.map(() => 200));

    const stored = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    const updates = await prisma.auditLog.findMany({
      where: { entityId: job.id, action: 'JOB_UPDATED' },
    });
    expect(updates).toHaveLength(titles.length);
    const changes = updates.map((u) => (u.changes as Record<string, Change>).title);
    expectContinuousChain(changes, baseJob.title, stored.title);
  });

  it('PATCH racing with CLOSE never edits a closed job and keeps the audit consistent', async () => {
    const owner = await signUp(app, 'CUSTOMER');
    for (let round = 0; round < 5; round += 1) {
      const { body: job } = await http()
        .post('/v1/me/jobs')
        .set(owner.auth)
        .send(baseJob)
        .expect(201);
      const [patch, close] = await Promise.all([
        http()
          .patch(`/v1/me/jobs/${job.id}`)
          .set(owner.auth)
          .send({ title: `Правка в гонке ${round}` }),
        http().post(`/v1/me/jobs/${job.id}/close`).set(owner.auth),
      ]);
      expect(close.status).toBe(200);
      expect([200, 409]).toContain(patch.status);

      const stored = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(stored.status).toBe('CLOSED');
      const audit = await prisma.auditLog.findMany({
        where: { entityId: job.id },
        orderBy: { createdAt: 'asc' },
      });
      const actions = audit.map((a) => a.action);
      if (patch.status === 200) {
        // Правка успела до закрытия: в журнале она стоит раньше закрытия, название сохранено.
        expect(actions).toEqual(['JOB_CREATED', 'JOB_UPDATED', 'JOB_CLOSED']);
        expect(stored.title).toBe(`Правка в гонке ${round}`);
      } else {
        expect(actions).toEqual(['JOB_CREATED', 'JOB_CLOSED']);
        expect(stored.title).toBe(baseJob.title);
      }
      expect(audit.at(-1)?.changes).toEqual({ status: { from: 'OPEN', to: 'CLOSED' } });
    }
  });

  it('parallel CLOSE requests close the job exactly once', async () => {
    const owner = await signUp(app, 'CUSTOMER');
    const { body: job } = await http()
      .post('/v1/me/jobs')
      .set(owner.auth)
      .send(baseJob)
      .expect(201);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => http().post(`/v1/me/jobs/${job.id}/close`).set(owner.auth)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await prisma.auditLog.count({ where: { entityId: job.id, action: 'JOB_CLOSED' } })).toBe(
      1,
    );
  });

  it('parallel POSTs cannot exceed the daily quota', async () => {
    const owner = await signUp(app, 'CUSTOMER');
    await prisma.job.createMany({
      data: Array.from({ length: 18 }, (_, i) => ({
        ...baseJob,
        category: 'OTHER' as const,
        title: `Ранее созданный ${i}`,
        ownerId: owner.id,
      })),
    });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        http()
          .post('/v1/me/jobs')
          .set(owner.auth)
          .send({ ...baseJob, title: `Параллельный заказ ${i}` }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 429)).toHaveLength(4);
    expect(await prisma.job.count({ where: { ownerId: owner.id } })).toBe(20);
  });
});
