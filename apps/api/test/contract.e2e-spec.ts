import { BID_LIMITS, JOB_LIMITS } from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { expectContract, uncoveredResponses } from './contract';
import { createTestApp } from './create-app';
import { signUp } from './helpers';

/**
 * Контракт: каждый ответ, объявленный в apps/api/openapi.json, получен от настоящего API
 * и проверен по схеме. Последний тест падает, если какая-то пара «операция + статус» не
 * проверена (ADR 0001 / 0003).
 */
const prisma = new PrismaClient();

const job = {
  title: 'Замена проводки в однокомнатной квартире',
  description: 'Нужно заменить проводку и щиток, квартира 35 м², стены бетон.',
  category: 'ELECTRICAL',
  city: 'Самара',
  budgetMin: 40_000,
  budgetMax: null,
};
const bid = { price: 45_000, durationDays: 5, comment: 'Сделаю за пять дней, есть допуск.' };
const profile = {
  about: 'Электрик, 12 лет опыта.',
  categories: ['ELECTRICAL'],
  cities: ['Самара'],
  experienceYears: 12,
};

const LIMIT_ENV = ['RATE_LIMIT_PER_MIN', 'AUTH_RATE_LIMIT_PER_MIN', 'WRITE_RATE_LIMIT_PER_MIN'];

async function cleanDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.job.deleteMany({ where: { ownerId: { not: null } } });
  await prisma.user.deleteMany();
}

async function withApp(
  limits: Record<string, string>,
  run: (app: NestExpressApplication) => Promise<void>,
): Promise<void> {
  for (const name of LIMIT_ENV) delete process.env[name];
  Object.assign(process.env, limits);
  const app = await createTestApp();
  try {
    await run(app);
  } finally {
    await app.close();
    for (const name of LIMIT_ENV) delete process.env[name];
  }
}

describe('API contract (e2e)', () => {
  beforeAll(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await prisma.$disconnect();
  });

  it('every success and error response matches openapi.json', async () => {
    await withApp(
      {
        RATE_LIMIT_PER_MIN: '1000',
        AUTH_RATE_LIMIT_PER_MIN: '1000',
        WRITE_RATE_LIMIT_PER_MIN: '1000',
      },
      async (app) => {
        const http = () => request(app.getHttpServer());
        const check = async (
          method: 'get' | 'post' | 'put' | 'patch',
          template: string,
          req: request.Test,
          status: number,
        ) => {
          const res = await req;
          expect(res.status).toBe(status);
          expectContract(res, method, template);
          return res;
        };

        await check('get', '/health', http().get('/health'), 200);

        // --- auth
        const email = `contract-${Date.now()}@example.ru`;
        const password = 'contract-password-1';
        const reg = { email, password, name: 'Контракт', role: 'CUSTOMER' };
        await check('post', '/v1/auth/register', http().post('/v1/auth/register').send(reg), 201);
        await check('post', '/v1/auth/register', http().post('/v1/auth/register').send(reg), 409);
        await check(
          'post',
          '/v1/auth/register',
          http().post('/v1/auth/register').send({ email: 'bad' }),
          400,
        );
        const login = await check(
          'post',
          '/v1/auth/login',
          http().post('/v1/auth/login').send({ email, password }),
          200,
        );
        await check(
          'post',
          '/v1/auth/login',
          http().post('/v1/auth/login').send({ email, password: 'wrong-password-1' }),
          401,
        );
        await check('post', '/v1/auth/login', http().post('/v1/auth/login').send({}), 400);
        const sessionAuth = { Authorization: `Bearer ${login.body.token}` };
        await check('get', '/v1/me', http().get('/v1/me').set(sessionAuth), 200);
        await check('get', '/v1/me', http().get('/v1/me'), 401);
        await check(
          'post',
          '/v1/auth/logout',
          http().post('/v1/auth/logout').set(sessionAuth),
          204,
        );
        await check('post', '/v1/auth/logout', http().post('/v1/auth/logout'), 401);

        const customer = await signUp(app, 'CUSTOMER');
        const other = await signUp(app, 'CUSTOMER');
        const contractor = await signUp(app, 'CONTRACTOR');

        // --- my jobs
        const MY_JOBS = '/v1/me/jobs';
        const MY_JOB = '/v1/me/jobs/{id}';
        const CLOSE = '/v1/me/jobs/{id}/close';
        const created = await check(
          'post',
          MY_JOBS,
          http().post(MY_JOBS).set(customer.auth).send(job),
          201,
        );
        const jobId: string = created.body.id;
        await check('post', MY_JOBS, http().post(MY_JOBS).set(customer.auth).send({}), 400);
        await check('post', MY_JOBS, http().post(MY_JOBS).send(job), 401);
        await check('post', MY_JOBS, http().post(MY_JOBS).set(contractor.auth).send(job), 403);
        await check('get', MY_JOBS, http().get(MY_JOBS).set(customer.auth), 200);
        await check('get', MY_JOBS, http().get(`${MY_JOBS}?page=0`).set(customer.auth), 400);
        await check('get', MY_JOBS, http().get(MY_JOBS), 401);
        await check('get', MY_JOBS, http().get(MY_JOBS).set(contractor.auth), 403);
        await check('get', MY_JOB, http().get(`${MY_JOBS}/${jobId}`).set(customer.auth), 200);
        await check('get', MY_JOB, http().get(`${MY_JOBS}/${jobId}`).set(other.auth), 404);
        await check('get', MY_JOB, http().get(`${MY_JOBS}/${jobId}`), 401);
        await check('get', MY_JOB, http().get(`${MY_JOBS}/${jobId}`).set(contractor.auth), 403);
        const patch = (auth: object | null, body: object, id = jobId) => {
          const req = http().patch(`${MY_JOBS}/${id}`).send(body);
          return auth ? req.set(auth as Record<string, string>) : req;
        };
        await check('patch', MY_JOB, patch(customer.auth, { city: 'Тольятти' }), 200);
        await check('patch', MY_JOB, patch(customer.auth, {}), 400);
        await check('patch', MY_JOB, patch(other.auth, { city: 'Тольятти' }), 404);
        await check('patch', MY_JOB, patch(null, { city: 'Тольятти' }), 401);
        await check('patch', MY_JOB, patch(contractor.auth, { city: 'Тольятти' }), 403);

        // --- public catalog
        await check('get', '/v1/jobs', http().get('/v1/jobs'), 200);
        await check('get', '/v1/jobs', http().get('/v1/jobs?limit=100'), 400);
        await check('get', '/v1/jobs/{id}', http().get(`/v1/jobs/${jobId}`), 200);
        await check('get', '/v1/jobs/{id}', http().get('/v1/jobs/missing-job'), 404);

        // --- profile
        const PROFILE = '/v1/me/profile';
        await check('get', PROFILE, http().get(PROFILE).set(contractor.auth), 200);
        await check('get', PROFILE, http().get(PROFILE), 401);
        await check('get', PROFILE, http().get(PROFILE).set(customer.auth), 403);
        await check('put', PROFILE, http().put(PROFILE).set(contractor.auth).send(profile), 200);
        await check('put', PROFILE, http().put(PROFILE).set(contractor.auth).send({}), 400);
        await check('put', PROFILE, http().put(PROFILE).send(profile), 401);
        await check('put', PROFILE, http().put(PROFILE).set(customer.auth).send(profile), 403);

        // --- bids
        const BIDS = '/v1/jobs/{jobId}/bids';
        const bidsUrl = (id: string) => `/v1/jobs/${id}/bids`;
        const placed = await check(
          'post',
          BIDS,
          http().post(bidsUrl(jobId)).set(contractor.auth).send(bid),
          201,
        );
        const bidId: string = placed.body.id;
        await check('post', BIDS, http().post(bidsUrl(jobId)).set(contractor.auth).send(bid), 409);
        await check('post', BIDS, http().post(bidsUrl(jobId)).set(contractor.auth).send({}), 400);
        await check(
          'post',
          BIDS,
          http().post(bidsUrl('missing-job')).set(contractor.auth).send(bid),
          404,
        );
        await check('post', BIDS, http().post(bidsUrl(jobId)).send(bid), 401);
        await check('post', BIDS, http().post(bidsUrl(jobId)).set(customer.auth).send(bid), 403);

        const MY_BIDS = '/v1/me/bids';
        await check('get', MY_BIDS, http().get(MY_BIDS).set(contractor.auth), 200);
        await check(
          'get',
          MY_BIDS,
          http().get(`${MY_BIDS}?jobId=bad%20id`).set(contractor.auth),
          400,
        );
        await check('get', MY_BIDS, http().get(MY_BIDS), 401);
        await check('get', MY_BIDS, http().get(MY_BIDS).set(customer.auth), 403);

        const OWNER_BIDS = '/v1/me/jobs/{jobId}/bids';
        const ownerBids = `/v1/me/jobs/${jobId}/bids`;
        await check('get', OWNER_BIDS, http().get(ownerBids).set(customer.auth), 200);
        await check('get', OWNER_BIDS, http().get(ownerBids).set(other.auth), 404);
        await check('get', OWNER_BIDS, http().get(ownerBids), 401);
        await check('get', OWNER_BIDS, http().get(ownerBids).set(contractor.auth), 403);

        const ACCEPT = '/v1/me/jobs/{jobId}/bids/{bidId}/accept';
        const acceptUrl = `${ownerBids}/${bidId}/accept`;
        await check('post', ACCEPT, http().post(acceptUrl).set(other.auth), 404);
        await check('post', ACCEPT, http().post(acceptUrl), 401);
        await check('post', ACCEPT, http().post(acceptUrl).set(contractor.auth), 403);
        await check('post', ACCEPT, http().post(acceptUrl).set(customer.auth), 200);
        await check('post', ACCEPT, http().post(acceptUrl).set(customer.auth), 409);

        // Отзыв: отдельный заказ, иначе выбранный отклик отозвать нельзя.
        const second = await http().post(MY_JOBS).set(customer.auth).send(job).expect(201);
        const pending = await http()
          .post(bidsUrl(second.body.id))
          .set(contractor.auth)
          .send(bid)
          .expect(201);
        const WITHDRAW = '/v1/me/bids/{bidId}/withdraw';
        const withdrawUrl = `${MY_BIDS}/${pending.body.id}/withdraw`;
        const otherContractor = await signUp(app, 'CONTRACTOR');
        await check('post', WITHDRAW, http().post(withdrawUrl).set(otherContractor.auth), 404);
        await check('post', WITHDRAW, http().post(withdrawUrl), 401);
        await check('post', WITHDRAW, http().post(withdrawUrl).set(customer.auth), 403);
        await check('post', WITHDRAW, http().post(withdrawUrl).set(contractor.auth), 200);
        await check('post', WITHDRAW, http().post(withdrawUrl).set(contractor.auth), 409);

        // Закрытие и конфликты закрытого заказа.
        const closeUrl = `${MY_JOBS}/${second.body.id}/close`;
        await check('post', CLOSE, http().post(closeUrl).set(other.auth), 404);
        await check('post', CLOSE, http().post(closeUrl), 401);
        await check('post', CLOSE, http().post(closeUrl).set(contractor.auth), 403);
        await check('post', CLOSE, http().post(closeUrl).set(customer.auth), 200);
        await check('post', CLOSE, http().post(closeUrl).set(customer.auth), 409);
        await check(
          'patch',
          MY_JOB,
          patch(customer.auth, { city: 'Тольятти' }, second.body.id),
          409,
        );
      },
    );
  });

  it('429 responses match openapi.json for every limit mechanism', async () => {
    // Общий лимит (default) на публичном маршруте.
    await withApp({ RATE_LIMIT_PER_MIN: '2' }, async (app) => {
      const get = () => request(app.getHttpServer()).get('/v1/jobs');
      await get().expect(200);
      await get().expect(200);
      const res = await get();
      expect(res.status).toBe(429);
      expectContract(res, 'get', '/v1/jobs');
    });

    // Лимит auth на вход.
    await withApp({ AUTH_RATE_LIMIT_PER_MIN: '1' }, async (app) => {
      const login = () =>
        request(app.getHttpServer())
          .post('/v1/auth/login')
          .send({ email: 'nobody@example.ru', password: 'guess-password-1' });
      await login().expect(401);
      const res = await login();
      expect(res.status).toBe(429);
      expectContract(res, 'post', '/v1/auth/login');
    });

    // Лимит write на изменение профиля.
    await withApp(
      { AUTH_RATE_LIMIT_PER_MIN: '1000', WRITE_RATE_LIMIT_PER_MIN: '1' },
      async (app) => {
        const contractor = await signUp(app, 'CONTRACTOR');
        const put = () =>
          request(app.getHttpServer()).put('/v1/me/profile').set(contractor.auth).send(profile);
        await put().expect(200);
        const res = await put();
        expect(res.status).toBe(429);
        expectContract(res, 'put', '/v1/me/profile');
      },
    );

    // Суточные квоты: заказы и отклики (квота заполняется напрямую в БД).
    await withApp(
      { AUTH_RATE_LIMIT_PER_MIN: '1000', WRITE_RATE_LIMIT_PER_MIN: '1000' },
      async (app) => {
        const http = () => request(app.getHttpServer());
        const customer = await signUp(app, 'CUSTOMER');
        const contractor = await signUp(app, 'CONTRACTOR');
        const total = Math.max(JOB_LIMITS.CREATED_PER_DAY, BID_LIMITS.CREATED_PER_DAY) + 1;
        await prisma.job.createMany({
          data: Array.from({ length: total }, (_, i) => ({
            ...job,
            title: `Заказ для квоты номер ${i}`,
            category: 'ELECTRICAL' as const,
            ownerId: customer.id,
          })),
        });
        const jobs = await prisma.job.findMany({ where: { ownerId: customer.id } });

        const jobQuota = await http().post('/v1/me/jobs').set(customer.auth).send(job);
        expect(jobQuota.status).toBe(429);
        expectContract(jobQuota, 'post', '/v1/me/jobs');

        await prisma.bid.createMany({
          data: jobs.slice(0, BID_LIMITS.CREATED_PER_DAY).map((item) => ({
            jobId: item.id,
            contractorId: contractor.id,
            price: 1000,
            comment: 'Отклик для заполнения квоты',
          })),
        });
        const bidQuota = await http()
          .post(`/v1/jobs/${jobs[jobs.length - 1].id}/bids`)
          .set(contractor.auth)
          .send(bid);
        expect(bidQuota.status).toBe(429);
        expectContract(bidQuota, 'post', '/v1/jobs/{jobId}/bids');
      },
    );
  });

  it('rejects responses that do not match the schema', () => {
    const fake = (status: number, body: unknown) =>
      ({ status, body, text: JSON.stringify(body) }) as unknown as request.Response;
    // Лишнее поле, null вместо строки, пропущенное поле, необъявленный статус.
    expect(() => expectContract(fake(200, { status: 'ok', extra: 1 }), 'get', '/health')).toThrow(
      'does not match',
    );
    const user = { id: 'u1', email: 'a@b.ru', name: 'Имя', role: 'CUSTOMER', createdAt: 'x' };
    expect(() => expectContract(fake(200, user), 'get', '/v1/me')).toThrow('does not match');
    const noName: Record<string, unknown> = { ...user, createdAt: new Date().toISOString() };
    delete noName.name;
    expect(() => expectContract(fake(200, noName), 'get', '/v1/me')).toThrow('does not match');
    expect(() =>
      expectContract(
        fake(200, { ...user, name: null, createdAt: new Date().toISOString() }),
        'get',
        '/v1/me',
      ),
    ).toThrow('does not match');
    expect(() => expectContract(fake(418, {}), 'get', '/v1/me')).toThrow('not declared');
  });

  it('covers every declared operation and status', () => {
    expect(
      uncoveredResponses([
        'GET /v1/jobs 429',
        'POST /v1/auth/login 429',
        'PUT /v1/me/profile 429',
        'POST /v1/me/jobs 429',
        'POST /v1/jobs/{jobId}/bids 429',
      ]),
    ).toEqual([]);
  });
});
