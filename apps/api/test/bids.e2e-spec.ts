import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { signUp, requiredAnswers } from './helpers';

const prisma = new PrismaClient();

const job = {
  title: 'Укладка ламината в квартире',
  description: 'Две комнаты, около 40 м², основание ровное, ламинат куплен.',
  category: 'FLOORING',
  details: requiredAnswers('FLOORING'),
  city: 'Гатчина',
  budgetMin: 30_000,
  budgetMax: 45_000,
};
const bid = {
  price: 38_000,
  durationDays: 4,
  comment: 'Сделаю за 4 дня, опыт 10 лет, свой инструмент.',
};
const profile = {
  about: 'Полы и отделка.\nРаботаю без предоплаты.',
  categories: ['FLOORING', 'FINISHING'],
  cities: ['Казань', ' Набережные Челны ', 'казань'],
  experienceYears: 10,
};

describe('Contractor profiles and bids (e2e)', () => {
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

  /** Заказчик с открытым заказом. */
  async function customerWithJob() {
    const customer = await signUp(app, 'CUSTOMER');
    const { body } = await http().post('/v1/me/jobs').set(customer.auth).send(job).expect(201);
    return { customer, jobId: body.id as string };
  }

  const placeBid = (auth: Record<string, string>, jobId: string, body: object = bid) =>
    http().post(`/v1/jobs/${jobId}/bids`).set(auth).send(body);

  describe('contractor profile', () => {
    it('starts empty, saves normalized data and audits the change', async () => {
      const contractor = await signUp(app, 'CONTRACTOR');
      const empty = await http().get('/v1/me/profile').set(contractor.auth).expect(200);
      expect(empty.body).toEqual({
        about: '',
        categories: [],
        cities: [],
        experienceYears: null,
        updatedAt: null,
      });

      const saved = await http()
        .put('/v1/me/profile')
        .set(contractor.auth)
        .send(profile)
        .expect(200);
      expect(saved.body).toMatchObject({
        about: profile.about,
        categories: ['FLOORING', 'FINISHING'],
        cities: ['Казань', 'Набережные Челны'],
        experienceYears: 10,
      });
      expect(
        await prisma.auditLog.count({
          where: { action: 'PROFILE_UPDATED', actorId: contractor.id },
        }),
      ).toBe(1);
    });

    it('is for contractors only', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      await http().get('/v1/me/profile').expect(401);
      await http().get('/v1/me/profile').set(customer.auth).expect(403);
      await http().put('/v1/me/profile').set(customer.auth).send(profile).expect(403);
    });

    it.each<[Record<string, unknown>, string]>([
      [{ categories: ['GARDENING'] }, 'unknown category'],
      [{ categories: ['TILING', 'TILING'] }, 'duplicate category'],
      [{ cities: Array.from({ length: 11 }, (_, i) => `Город ${i}`) }, 'too many cities'],
      [{ cities: ['М'] }, 'short city'],
      [{ experienceYears: 71 }, 'experience above limit'],
      [{ experienceYears: 2.5 }, 'fractional experience'],
      [{ about: 'x'.repeat(2001) }, 'long about'],
      [{ userId: 'someone-else' }, 'foreign field'],
    ])('rejects %j (%s)', async (override) => {
      const contractor = await signUp(app, 'CONTRACTOR');
      await http()
        .put('/v1/me/profile')
        .set(contractor.auth)
        .send({ ...profile, ...override })
        .expect(400);
    });
  });

  describe('placing bids', () => {
    it('lets a contractor bid once on an open job', async () => {
      const { jobId } = await customerWithJob();
      const contractor = await signUp(app, 'CONTRACTOR');
      const res = await placeBid(contractor.auth, jobId).expect(201);
      expect(res.body).toMatchObject({
        ...bid,
        status: 'PENDING',
        jobId,
        job: { id: jobId, status: 'OPEN' },
      });
      const again = await placeBid(contractor.auth, jobId).expect(409);
      expect(again.body.message).toBe('Вы уже откликнулись на этот заказ');
      expect(await prisma.auditLog.count({ where: { action: 'BID_CREATED' } })).toBe(1);
    });

    it('denies customers and anonymous users', async () => {
      const { customer, jobId } = await customerWithJob();
      await placeBid({}, jobId).expect(401);
      await placeBid(customer.auth, jobId).expect(403);
      expect(await prisma.bid.count()).toBe(0);
    });

    it('rejects bids on unknown, closed and in-progress jobs', async () => {
      const { customer, jobId } = await customerWithJob();
      const contractor = await signUp(app, 'CONTRACTOR');
      await placeBid(contractor.auth, 'no-such-job').expect(404);
      await placeBid(contractor.auth, '../etc').expect(404);
      await http().post(`/v1/me/jobs/${jobId}/close`).set(customer.auth).expect(200);
      await placeBid(contractor.auth, jobId).expect(409);
    });

    it.each<[Record<string, unknown>, string]>([
      [{ price: -1 }, 'negative price'],
      [{ price: 100.5 }, 'fractional price'],
      [{ price: '38000' }, 'price as string'],
      [{ price: undefined }, 'missing price'],
      [{ durationDays: 0 }, 'zero duration'],
      [{ durationDays: 366 }, 'duration above limit'],
      [{ comment: 'Коротко' }, 'short comment'],
      [{ comment: 'Нормальный текст‮перевёрнутый' }, 'bidi override in comment'],
      [{ status: 'ACCEPTED' }, 'status injection'],
      [{ contractorId: 'someone' }, 'contractor injection'],
      [{ jobId: 'other-job' }, 'job injection'],
    ])('rejects %j (%s) with 400', async (override) => {
      const { jobId } = await customerWithJob();
      const contractor = await signUp(app, 'CONTRACTOR');
      await placeBid(contractor.auth, jobId, { ...bid, ...override }).expect(400);
      expect(await prisma.bid.count()).toBe(0);
    });

    it('limits bids per day', async () => {
      const { customer } = await customerWithJob();
      const contractor = await signUp(app, 'CONTRACTOR');
      const jobs = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          prisma.job.create({
            data: {
              ...job,
              title: `Заказ для лимита ${i}`,
              category: 'FLOORING',
              ownerId: customer.id,
            },
          }),
        ),
      );
      await prisma.bid.createMany({
        data: jobs.map((j) => ({
          jobId: j.id,
          contractorId: contractor.id,
          price: 1000,
          comment: 'Отклик для проверки лимита',
        })),
      });
      const fresh = await prisma.job.create({
        data: { ...job, category: 'FLOORING', ownerId: customer.id },
      });
      const res = await placeBid(contractor.auth, fresh.id).expect(429);
      expect(res.body.message).toMatch(/не больше 30 откликов/);
    });
  });

  describe('visibility', () => {
    it('a contractor sees only own bids', async () => {
      const { jobId } = await customerWithJob();
      const a = await signUp(app, 'CONTRACTOR');
      const b = await signUp(app, 'CONTRACTOR');
      await placeBid(a.auth, jobId).expect(201);
      await placeBid(b.auth, jobId, { ...bid, price: 99_000 }).expect(201);
      const mine = await http().get('/v1/me/bids').set(a.auth).expect(200);
      expect(mine.body.total).toBe(1);
      expect(mine.body.items[0].price).toBe(bid.price);
      const byJob = await http().get(`/v1/me/bids?jobId=${jobId}`).set(b.auth).expect(200);
      expect(byJob.body.items.map((x: { price: number }) => x.price)).toEqual([99_000]);
      await http().get('/v1/me/bids?jobId=../x').set(a.auth).expect(400);
    });

    it('only the job owner sees its bids, without contractor email or id', async () => {
      const { customer, jobId } = await customerWithJob();
      const stranger = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      await http().put('/v1/me/profile').set(contractor.auth).send(profile).expect(200);
      await placeBid(contractor.auth, jobId).expect(201);

      await http().get(`/v1/me/jobs/${jobId}/bids`).set(stranger.auth).expect(404);
      await http().get(`/v1/me/jobs/${jobId}/bids`).set(contractor.auth).expect(403);

      const res = await http().get(`/v1/me/jobs/${jobId}/bids`).set(customer.auth).expect(200);
      expect(res.body).toHaveLength(1);
      // Номер публичной карточки и рейтинг — да; email и id пользователя — нет.
      expect(res.body[0].contractor).toEqual({
        publicId: expect.any(Number),
        name: expect.any(String),
        profile: expect.objectContaining({ categories: ['FLOORING', 'FINISHING'] }),
        rating: { average: null, count: 0 },
      });
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('@example.ru');
      expect(raw).not.toContain(contractor.id);
    });

    it('public job data does not reveal bids', async () => {
      const { jobId } = await customerWithJob();
      const contractor = await signUp(app, 'CONTRACTOR');
      await placeBid(contractor.auth, jobId).expect(201);
      const res = await http().get(`/v1/jobs/${jobId}`).expect(200);
      expect(JSON.stringify(res.body)).not.toContain(bid.comment);
    });
  });

  describe('withdraw', () => {
    it('withdraws own pending bid only', async () => {
      const { customer, jobId } = await customerWithJob();
      const a = await signUp(app, 'CONTRACTOR');
      const b = await signUp(app, 'CONTRACTOR');
      const { body: created } = await placeBid(a.auth, jobId).expect(201);

      await http().post(`/v1/me/bids/${created.id}/withdraw`).set(b.auth).expect(404);
      await http().post(`/v1/me/bids/${created.id}/withdraw`).set(customer.auth).expect(403);
      const res = await http().post(`/v1/me/bids/${created.id}/withdraw`).set(a.auth).expect(200);
      expect(res.body.status).toBe('WITHDRAWN');
      await http().post(`/v1/me/bids/${created.id}/withdraw`).set(a.auth).expect(409);

      const ownerView = await http()
        .get(`/v1/me/jobs/${jobId}/bids`)
        .set(customer.auth)
        .expect(200);
      expect(ownerView.body).toHaveLength(0);
    });
  });

  describe('accept', () => {
    it('accepts one bid: job in progress, other bids rejected, everything audited', async () => {
      const { customer, jobId } = await customerWithJob();
      const a = await signUp(app, 'CONTRACTOR');
      const b = await signUp(app, 'CONTRACTOR');
      const { body: bidA } = await placeBid(a.auth, jobId).expect(201);
      const { body: bidB } = await placeBid(b.auth, jobId, { ...bid, price: 41_000 }).expect(201);

      const res = await http()
        .post(`/v1/me/jobs/${jobId}/bids/${bidA.id}/accept`)
        .set(customer.auth)
        .expect(200);
      expect(res.body.status).toBe('ACCEPTED');

      const stored = await prisma.bid.findMany({ orderBy: { price: 'asc' } });
      expect(stored.map((x) => [x.id, x.status])).toEqual([
        [bidA.id, 'ACCEPTED'],
        [bidB.id, 'REJECTED'],
      ]);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe(
        'IN_PROGRESS',
      );

      const actions = (await prisma.auditLog.findMany({ where: { actorId: customer.id } }))
        .map((x) => x.action)
        .sort();
      expect(actions).toEqual(['BID_ACCEPTED', 'BID_REJECTED', 'JOB_CREATED', 'JOB_STARTED']);

      const mineB = await http().get('/v1/me/bids').set(b.auth).expect(200);
      expect(mineB.body.items[0]).toMatchObject({
        status: 'REJECTED',
        rejectReason: 'OTHER_ACCEPTED',
        job: { status: 'IN_PROGRESS', closeOutcome: null },
      });

      // Повторный выбор и новые отклики невозможны.
      await http()
        .post(`/v1/me/jobs/${jobId}/bids/${bidB.id}/accept`)
        .set(customer.auth)
        .expect(409);
      const c = await signUp(app, 'CONTRACTOR');
      await placeBid(c.auth, jobId).expect(409);
      // Отозвать выбранный отклик нельзя.
      await http().post(`/v1/me/bids/${bidA.id}/withdraw`).set(a.auth).expect(409);
    });

    it('denies other customers, contractors and foreign bids', async () => {
      const { customer, jobId } = await customerWithJob();
      const other = await customerWithJob();
      const stranger = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const { body: own } = await placeBid(contractor.auth, jobId).expect(201);
      const { body: foreign } = await placeBid(contractor.auth, other.jobId).expect(201);

      await http()
        .post(`/v1/me/jobs/${jobId}/bids/${own.id}/accept`)
        .set(stranger.auth)
        .expect(404);
      await http()
        .post(`/v1/me/jobs/${jobId}/bids/${own.id}/accept`)
        .set(contractor.auth)
        .expect(403);
      // Отклик на другой заказ через свой заказ выбрать нельзя.
      await http()
        .post(`/v1/me/jobs/${jobId}/bids/${foreign.id}/accept`)
        .set(customer.auth)
        .expect(404);
      expect(await prisma.bid.count({ where: { status: 'ACCEPTED' } })).toBe(0);
    });

    it('cannot accept a withdrawn bid', async () => {
      const { customer, jobId } = await customerWithJob();
      const contractor = await signUp(app, 'CONTRACTOR');
      const { body } = await placeBid(contractor.auth, jobId).expect(201);
      await http().post(`/v1/me/bids/${body.id}/withdraw`).set(contractor.auth).expect(200);
      await http()
        .post(`/v1/me/jobs/${jobId}/bids/${body.id}/accept`)
        .set(customer.auth)
        .expect(409);
    });

    it('closing a job rejects its pending bids', async () => {
      const { customer, jobId } = await customerWithJob();
      const contractor = await signUp(app, 'CONTRACTOR');
      await placeBid(contractor.auth, jobId).expect(201);
      await http().post(`/v1/me/jobs/${jobId}/close`).set(customer.auth).expect(200);
      const stored = await prisma.bid.findFirstOrThrow();
      expect(stored).toMatchObject({ status: 'REJECTED', rejectReason: 'JOB_CLOSED' });
    });

    it('a job without a contractor can only be cancelled', async () => {
      const { customer, jobId } = await customerWithJob();
      const close = (body: object) =>
        http().post(`/v1/me/jobs/${jobId}/close`).set(customer.auth).send(body);
      await close({ outcome: 'DONE' }).expect(400);
      await close({ outcome: 'COMPLETED' }).expect(409);
      const res = await close({ outcome: 'CANCELLED' }).expect(200);
      expect(res.body).toMatchObject({ status: 'CLOSED', closeOutcome: 'CANCELLED' });
    });

    it.each(['COMPLETED', 'CANCELLED'] as const)(
      'a job in progress is closed with outcome %s, visible to the contractor',
      async (outcome) => {
        const { customer, jobId } = await customerWithJob();
        const contractor = await signUp(app, 'CONTRACTOR');
        const { body: placed } = await placeBid(contractor.auth, jobId).expect(201);
        await http()
          .post(`/v1/me/jobs/${jobId}/bids/${placed.id}/accept`)
          .set(customer.auth)
          .expect(200);
        // У заказа в работе исход обязателен.
        await http().post(`/v1/me/jobs/${jobId}/close`).set(customer.auth).expect(400);
        const res = await http()
          .post(`/v1/me/jobs/${jobId}/close`)
          .set(customer.auth)
          .send({ outcome })
          .expect(200);
        expect(res.body).toMatchObject({ status: 'CLOSED', closeOutcome: outcome });

        const mine = await http().get('/v1/me/bids').set(contractor.auth).expect(200);
        expect(mine.body.items[0]).toMatchObject({
          status: 'ACCEPTED',
          rejectReason: null,
          job: { status: 'CLOSED', closeOutcome: outcome },
        });
        const audit = await prisma.auditLog.findFirstOrThrow({
          where: { entityId: jobId, action: 'JOB_CLOSED' },
        });
        expect(audit.changes).toEqual({
          status: { from: 'IN_PROGRESS', to: 'CLOSED' },
          closeOutcome: { from: null, to: outcome },
        });
      },
    );

    it('the database allows only one accepted bid per job', async () => {
      const { customer, jobId } = await customerWithJob();
      const a = await signUp(app, 'CONTRACTOR');
      const b = await signUp(app, 'CONTRACTOR');
      await prisma.bid.create({
        data: { jobId, contractorId: a.id, price: 1, comment: 'Первый отклик', status: 'ACCEPTED' },
      });
      await expect(
        prisma.bid.create({
          data: {
            jobId,
            contractorId: b.id,
            price: 1,
            comment: 'Второй отклик',
            status: 'ACCEPTED',
          },
        }),
      ).rejects.toThrow();
      expect(customer.id).toBeTruthy();
    });
  });
});
