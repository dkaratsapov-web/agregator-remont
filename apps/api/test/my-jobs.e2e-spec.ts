import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { signUp } from './helpers';

const prisma = new PrismaClient();

const validJob = {
  title: 'Замена проводки в квартире',
  description: 'Нужна полная замена проводки в двухкомнатной квартире, около 50 м².',
  category: 'ELECTRICAL',
  city: 'Санкт-Петербург',
  budgetMin: 80_000,
  budgetMax: 120_000,
};

describe('My jobs (e2e)', () => {
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

  const create = (auth: Record<string, string>, body: object = validJob) =>
    http().post('/v1/me/jobs').set(auth).send(body);

  describe('access control', () => {
    it('requires a session', async () => {
      await http().get('/v1/me/jobs').expect(401);
      await http().post('/v1/me/jobs').send(validJob).expect(401);
      await http().patch('/v1/me/jobs/x').send({ title: 'Новое название' }).expect(401);
      await http().post('/v1/me/jobs/x/close').expect(401);
    });

    it('forbids contractors', async () => {
      const contractor = await signUp(app, 'CONTRACTOR');
      await http().get('/v1/me/jobs').set(contractor.auth).expect(403);
      await create(contractor.auth).expect(403);
      expect(await prisma.job.count()).toBe(0);
    });

    it("hides another customer's job behind 404 for read, edit and close", async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const other = await signUp(app, 'CUSTOMER');
      const { body: job } = await create(owner.auth).expect(201);

      await http().get(`/v1/me/jobs/${job.id}`).set(other.auth).expect(404);
      await http()
        .patch(`/v1/me/jobs/${job.id}`)
        .set(other.auth)
        .send({ title: 'Взломанное название' })
        .expect(404);
      await http().post(`/v1/me/jobs/${job.id}/close`).set(other.auth).expect(404);

      const stored = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(stored.title).toBe(validJob.title);
      expect(stored.status).toBe('OPEN');
      const list = await http().get('/v1/me/jobs').set(other.auth).expect(200);
      expect(list.body.total).toBe(0);
    });

    it('cannot edit demo jobs without an owner', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      await prisma.job.create({
        data: {
          id: 'demo-x',
          title: 'Демо',
          description: 'Демо заказ без владельца',
          category: 'OTHER',
          city: 'Москва',
        },
      });
      await http()
        .patch('/v1/me/jobs/demo-x')
        .set(customer.auth)
        .send({ title: 'Моё теперь' })
        .expect(404);
    });
  });

  describe('create', () => {
    it('creates an owned open job that appears in the public catalog without owner data', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      const res = await create(customer.auth).expect(201);
      expect(res.body).toMatchObject({
        ...validJob,
        status: 'OPEN',
        currency: 'RUB',
        editable: true,
      });

      const stored = await prisma.job.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.ownerId).toBe(customer.id);

      const publicJob = await http().get(`/v1/jobs/${res.body.id}`).expect(200);
      expect(publicJob.body).not.toHaveProperty('ownerId');
      expect(JSON.stringify(publicJob.body)).not.toContain(customer.id);
    });

    it('ignores nothing silently: server-owned fields in the body are rejected', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      const other = await signUp(app, 'CUSTOMER');
      for (const extra of [
        { ownerId: other.id },
        { status: 'CLOSED' },
        { id: 'chosen-id' },
        { createdAt: '2020-01-01' },
      ]) {
        await create(customer.auth, { ...validJob, ...extra }).expect(400);
      }
      expect(await prisma.job.count()).toBe(0);
    });

    it.each<[Record<string, unknown>, string]>([
      [{ title: 'Окно' }, 'short title'],
      [{ title: 'x'.repeat(161) }, 'long title'],
      [{ title: 'Ремонт‮кухни' }, 'bidi override in title'],
      [{ description: 'Коротко' }, 'short description'],
      [{ description: 'x'.repeat(5001) }, 'long description'],
      [{ category: 'GARDENING' }, 'unknown category'],
      [{ city: 'М' }, 'short city'],
      [{ budgetMin: -1 }, 'negative budget'],
      [{ budgetMax: 1.5 }, 'fractional budget'],
      [{ budgetMax: '100000' }, 'budget as string'],
      [{ budgetMax: 2_000_000_000 }, 'budget above limit'],
      [{ budgetMin: 200_000, budgetMax: 100_000 }, 'min above max'],
      [{ title: 12345 }, 'title as number'],
    ])('rejects %j (%s) with 400', async (override) => {
      const customer = await signUp(app, 'CUSTOMER');
      await create(customer.auth, { ...validJob, ...override }).expect(400);
      expect(await prisma.job.count()).toBe(0);
    });

    it('accepts a negotiable budget and multi-line descriptions', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      const res = await create(customer.auth, {
        ...validJob,
        budgetMin: null,
        budgetMax: undefined,
        description: 'Первая строка описания работ.\r\nВторая строка с деталями.',
      }).expect(201);
      expect(res.body.description).toBe('Первая строка описания работ.\nВторая строка с деталями.');
      expect(res.body.budgetMin).toBeNull();
      expect(res.body.budgetMax).toBeNull();
    });

    it('limits jobs created per day', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      await prisma.job.createMany({
        data: Array.from({ length: 20 }, (_, i) => ({
          title: `Заказ ${i}`,
          description: 'Описание заказа для проверки лимита',
          category: 'OTHER' as const,
          city: 'Москва',
          ownerId: customer.id,
        })),
      });
      const res = await create(customer.auth).expect(429);
      expect(res.body.message).toMatch(/не больше 20 заказов/);
    });
  });

  describe('update and close', () => {
    it('updates own open job and writes an audit entry with the changed fields', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      const { body: job } = await create(customer.auth).expect(201);
      const res = await http()
        .patch(`/v1/me/jobs/${job.id}`)
        .set(customer.auth)
        .send({ title: 'Замена проводки и щитка', budgetMax: null })
        .expect(200);
      expect(res.body).toMatchObject({ title: 'Замена проводки и щитка', budgetMax: null });

      const audit = await prisma.auditLog.findMany({
        where: { entityId: job.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((a) => a.action)).toEqual(['JOB_CREATED', 'JOB_UPDATED']);
      expect(audit[1].actorId).toBe(customer.id);
      expect(audit[1].changes).toEqual({
        title: { from: validJob.title, to: 'Замена проводки и щитка' },
        budgetMax: { from: validJob.budgetMax, to: null },
      });
    });

    it('validates the merged budget range on update', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      const { body: job } = await create(customer.auth).expect(201);
      await http()
        .patch(`/v1/me/jobs/${job.id}`)
        .set(customer.auth)
        .send({ budgetMin: 500_000 })
        .expect(400);
    });

    it('rejects empty and server-owned updates', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      const { body: job } = await create(customer.auth).expect(201);
      await http().patch(`/v1/me/jobs/${job.id}`).set(customer.auth).send({}).expect(400);
      await http()
        .patch(`/v1/me/jobs/${job.id}`)
        .set(customer.auth)
        .send({ status: 'CLOSED' })
        .expect(400);
      await http()
        .patch(`/v1/me/jobs/${job.id}`)
        .set(customer.auth)
        .send({ ownerId: 'someone' })
        .expect(400);
    });

    it('closes own job once, then forbids edits and repeated closing', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      const { body: job } = await create(customer.auth).expect(201);
      const closed = await http()
        .post(`/v1/me/jobs/${job.id}/close`)
        .set(customer.auth)
        .expect(200);
      expect(closed.body).toMatchObject({ status: 'CLOSED', editable: false });

      await http().post(`/v1/me/jobs/${job.id}/close`).set(customer.auth).expect(409);
      await http()
        .patch(`/v1/me/jobs/${job.id}`)
        .set(customer.auth)
        .send({ title: 'После закрытия' })
        .expect(409);

      const audit = await prisma.auditLog.findMany({
        where: { entityId: job.id, action: 'JOB_CLOSED' },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].changes).toEqual({ status: { from: 'OPEN', to: 'CLOSED' } });
    });

    it('lists only own jobs, newest first', async () => {
      const a = await signUp(app, 'CUSTOMER');
      const b = await signUp(app, 'CUSTOMER');
      await create(a.auth, { ...validJob, title: 'Первый заказ А' }).expect(201);
      await create(b.auth, { ...validJob, title: 'Заказ Б' }).expect(201);
      await create(a.auth, { ...validJob, title: 'Второй заказ А' }).expect(201);
      const res = await http().get('/v1/me/jobs').set(a.auth).expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items.map((j: { title: string }) => j.title)).toEqual([
        'Второй заказ А',
        'Первый заказ А',
      ]);
    });
  });
});
