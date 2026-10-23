import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp } from './helpers';

const prisma = new PrismaClient();
const jobBody = {
  title: 'Укладка ламината в комнате',
  description: 'Комната 18 м², основание ровное, плинтус тоже нужен.',
  category: 'OTHER',
  details: requiredAnswers('OTHER'),
  city: 'Москва',
};
const bidBody = {
  price: 40_000,
  durationDays: 4,
  comment: 'Уложу за четыре дня, свой инструмент.',
};

type Auth = Awaited<ReturnType<typeof signUp>>;

describe('Contact exchange by consent (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  const clean = async () => {
    await prisma.auditLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.jobPlan.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany({ where: { ownerId: { not: null } } });
    await prisma.user.deleteMany();
  };
  beforeEach(clean);

  afterAll(async () => {
    await clean();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
  });

  const contacts = (who: Auth, jobId: string) =>
    http().get(`/v1/jobs/${jobId}/contacts`).set(who.auth);
  const share = (who: Auth, jobId: string) =>
    http().put(`/v1/jobs/${jobId}/contacts`).set(who.auth);
  const hide = (who: Auth, jobId: string) =>
    http().delete(`/v1/jobs/${jobId}/contacts`).set(who.auth);
  const user = (who: Auth) => prisma.user.findUniqueOrThrow({ where: { id: who.id } });

  async function deal(customer: Auth, contractor: Auth) {
    const { body: job } = await http().post('/v1/me/jobs').set(customer.auth).send(jobBody);
    const { body: placed } = await http()
      .post(`/v1/jobs/${job.id}/bids`)
      .set(contractor.auth)
      .send(bidBody)
      .expect(201);
    return { jobId: job.id as string, bidId: placed.id as string };
  }
  const accept = (customer: Auth, jobId: string, bidId: string) =>
    http().post(`/v1/me/jobs/${jobId}/bids/${bidId}/accept`).set(customer.auth).expect(200);

  it('nobody sees contacts until their owner opens them; each side decides for itself', async () => {
    const customer = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');
    await prisma.user.update({ where: { id: customer.id }, data: { phone: '+79001234567' } });
    const { jobId, bidId } = await deal(customer, contractor);

    // До выбора исполнителя сделки нет.
    await contacts(customer, jobId).expect(404);
    await share(contractor, jobId).expect(404);
    await accept(customer, jobId, bidId);

    const before = await contacts(customer, jobId).expect(200);
    expect(before.body).toEqual({
      viewer: 'OWNER',
      counterpartName: (await user(contractor)).name,
      mySharedAt: null,
      myPhoneSet: true,
      theirs: null,
    });

    // Заказчик открыл свои: исполнитель видит их, заказчик чужих по-прежнему не видит.
    const shared = await share(customer, jobId).expect(200);
    expect(shared.body.mySharedAt).toEqual(expect.any(String));
    expect(shared.body.theirs).toBeNull();
    const seen = await contacts(contractor, jobId).expect(200);
    expect(seen.body).toMatchObject({
      viewer: 'CONTRACTOR',
      myPhoneSet: false,
      mySharedAt: null,
      theirs: {
        name: (await user(customer)).name,
        phone: '+79001234567',
        email: (await user(customer)).email,
      },
    });

    // Повтор не дублирует и не пишет журнал второй раз.
    await share(customer, jobId).expect(200);
    expect(await prisma.contactShare.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'CONTACTS_SHARED' } })).toBe(1);

    // Исполнитель открыл свои — без телефона в профиле видно только email.
    await share(contractor, jobId).expect(200);
    const both = await contacts(customer, jobId).expect(200);
    expect(both.body.theirs).toEqual({
      name: (await user(contractor)).name,
      phone: null,
      email: (await user(contractor)).email,
    });

    // Скрыл — больше не видно; журнал записан.
    const hidden = await hide(customer, jobId).expect(200);
    expect(hidden.body.mySharedAt).toBeNull();
    expect((await contacts(contractor, jobId).expect(200)).body.theirs).toBeNull();
    await hide(customer, jobId).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'CONTACTS_HIDDEN' } })).toBe(1);
  });

  it('strangers and other bidders get 404, as for a job they cannot see', async () => {
    const customer = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');
    const rival = await signUp(app, 'CONTRACTOR');
    const stranger = await signUp(app, 'CUSTOMER');
    const { jobId, bidId } = await deal(customer, contractor);
    await http().post(`/v1/jobs/${jobId}/bids`).set(rival.auth).send(bidBody).expect(201);
    await accept(customer, jobId, bidId);
    await share(customer, jobId).expect(200);
    for (const who of [rival, stranger]) {
      await contacts(who, jobId).expect(404);
      await share(who, jobId).expect(404);
      await hide(who, jobId).expect(404);
    }
    await contacts(customer, 'no-such-job').expect(404);
    await contacts(customer, '../etc').expect(404);
    await http().get(`/v1/jobs/${jobId}/contacts`).expect(401);
    expect(await prisma.contactShare.count()).toBe(1);
  });

  it('consent ends with the deal: after the contractor quits, the next one sees nothing', async () => {
    const customer = await signUp(app, 'CUSTOMER');
    const first = await signUp(app, 'CONTRACTOR');
    const second = await signUp(app, 'CONTRACTOR');
    const { jobId, bidId } = await deal(customer, first);
    const { body: secondBid } = await http()
      .post(`/v1/jobs/${jobId}/bids`)
      .set(second.auth)
      .send(bidBody)
      .expect(201);
    await accept(customer, jobId, bidId);
    await share(customer, jobId).expect(200);
    await http()
      .post(`/v1/jobs/${jobId}/quit`)
      .set(first.auth)
      .send({ reason: 'Заболел, не смогу выйти на объект' })
      .expect(204);
    await contacts(first, jobId).expect(404);

    await accept(customer, jobId, secondBid.id);
    expect((await contacts(second, jobId).expect(200)).body.theirs).toBeNull();
    expect((await contacts(customer, jobId).expect(200)).body.mySharedAt).toBeNull();
  });

  it('a blocked side’s contacts are not shown, even if opened before', async () => {
    const customer = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');
    const { jobId, bidId } = await deal(customer, contractor);
    await accept(customer, jobId, bidId);
    await share(contractor, jobId).expect(200);
    await prisma.user.update({ where: { id: contractor.id }, data: { blockedAt: new Date() } });
    expect((await contacts(customer, jobId).expect(200)).body.theirs).toBeNull();
  });

  it('two simultaneous requests to open contacts store one consent', async () => {
    const customer = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');
    const { jobId, bidId } = await deal(customer, contractor);
    await accept(customer, jobId, bidId);
    const results = await Promise.all([share(customer, jobId), share(customer, jobId)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await prisma.contactShare.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'CONTACTS_SHARED' } })).toBe(1);
  });
});
