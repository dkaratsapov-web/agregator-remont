import { BID_LIMITS, JOB_LIMITS } from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { ApiExceptionFilter } from '../src/common/exception-filter';
import { HealthController } from '../src/health/health.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { expectContract, uncoveredResponses } from './contract';
import { createTestApp } from './create-app';
import { CHALLENGE, NONCE, STATE, VERIFIER, startFakeBank } from './fake-bank';
import { signUp, signUpAdmin, requiredAnswers } from './helpers';

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
  details: requiredAnswers('ELECTRICAL'),
  city: 'Химки',
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
  await prisma.lead.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.jobDraft.deleteMany();
  await prisma.job.deleteMany({ where: { ownerId: { not: null } } });
  await prisma.externalAccount.deleteMany();
  await prisma.user.deleteMany();
}

async function withApp(
  limits: Record<string, string>,
  run: (app: NestExpressApplication) => Promise<void>,
  options: Parameters<typeof createTestApp>[1] = {},
): Promise<void> {
  for (const name of LIMIT_ENV) delete process.env[name];
  Object.assign(process.env, limits);
  const app = await createTestApp(false, options);
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
        await check('get', '/health/ready', http().get('/health/ready'), 200);

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
        const detailed = await check(
          'post',
          MY_JOBS,
          http()
            .post(MY_JOBS)
            .set(customer.auth)
            .send({
              ...job,
              details: { task: 'full', area: 35, oldWiring: 'aluminum', smartHome: true },
            }),
          201,
        );
        expect(detailed.body.details).toEqual({
          task: 'full',
          area: 35,
          oldWiring: 'aluminum',
          smartHome: true,
        });
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
        await check('patch', MY_JOB, patch(customer.auth, { city: 'Мытищи' }), 200);
        await check('patch', MY_JOB, patch(customer.auth, {}), 400);
        await check('patch', MY_JOB, patch(other.auth, { city: 'Мытищи' }), 404);
        await check('patch', MY_JOB, patch(null, { city: 'Мытищи' }), 401);
        await check('patch', MY_JOB, patch(contractor.auth, { city: 'Мытищи' }), 403);

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
        await check(
          'get',
          OWNER_BIDS,
          http().get(`${ownerBids}?limit=500`).set(customer.auth),
          400,
        );
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
        await check(
          'post',
          CLOSE,
          http().post(closeUrl).set(customer.auth).send({ outcome: 'DONE' }),
          400,
        );
        await check('post', CLOSE, http().post(closeUrl).set(customer.auth), 200);
        await check('post', CLOSE, http().post(closeUrl).set(customer.auth), 409);
        await check('patch', MY_JOB, patch(customer.auth, { city: 'Мытищи' }, second.body.id), 409);
      },
    );
  });

  it('account endpoints match openapi.json', async () => {
    const high = {
      RATE_LIMIT_PER_MIN: '1000',
      AUTH_RATE_LIMIT_PER_MIN: '1000',
      WRITE_RATE_LIMIT_PER_MIN: '1000',
    };
    await withApp(high, async (app) => {
      const http = () => request(app.getHttpServer());
      const check = async (
        method: 'get' | 'post' | 'put' | 'patch' | 'delete',
        template: string,
        req: request.Test,
        status: number,
      ) => {
        const res = await req;
        expect(res.status).toBe(status);
        expectContract(res, method, template);
        return res;
      };
      const email = `contract-acc-${Date.now()}@example.ru`;
      const password = 'correct-horse-battery';
      const reg = await http()
        .post('/v1/auth/register')
        .send({ email, password, name: 'Контракт', role: 'CUSTOMER' })
        .expect(201);
      const auth = { Authorization: `Bearer ${reg.body.token}` };
      const other = await http().post('/v1/auth/login').send({ email, password }).expect(200);

      await check('patch', '/v1/me', http().patch('/v1/me').set(auth).send({ city: 'Тверь' }), 200);
      await check('patch', '/v1/me', http().patch('/v1/me').set(auth).send({ phone: '1' }), 400);
      await check('patch', '/v1/me', http().patch('/v1/me').send({}), 401);

      const PREF = '/v1/me/preferences';
      await check('patch', PREF, http().patch(PREF).set(auth).send({ theme: 'dark' }), 200);
      await check('patch', PREF, http().patch(PREF).set(auth).send({ theme: 'x' }), 400);
      await check('patch', PREF, http().patch(PREF).send({}), 401);

      const SESS = '/v1/me/sessions';
      const list = await check('get', SESS, http().get(SESS).set(auth), 200);
      await check('get', SESS, http().get(SESS), 401);
      const ONE = '/v1/me/sessions/{id}';
      const current = list.body.find((s: { current: boolean }) => s.current).id;
      const otherId = list.body.find((s: { current: boolean }) => !s.current).id;
      await check('delete', ONE, http().delete(`${SESS}/${current}`).set(auth), 400);
      await check('delete', ONE, http().delete(`${SESS}/missing`).set(auth), 404);
      await check('delete', ONE, http().delete(`${SESS}/${otherId}`), 401);
      await check('delete', ONE, http().delete(`${SESS}/${otherId}`).set(auth), 204);
      void other;
      const REV = '/v1/me/sessions/revoke-others';
      await check('post', REV, http().post(REV).set(auth), 200);
      await check('post', REV, http().post(REV), 401);

      const AV = '/v1/me/avatar';
      await check('get', AV, http().get(AV).set(auth), 404);
      await check('get', AV, http().get(AV), 401);
      const png = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#0d1320' },
      })
        .png()
        .toBuffer();
      await check(
        'put',
        AV,
        http()
          .put(AV)
          .set(auth)
          .attach('file', png, { filename: 'a.png', contentType: 'image/png' }),
        200,
      );
      await check(
        'put',
        AV,
        http()
          .put(AV)
          .set(auth)
          .attach('file', Buffer.from('nope'), { filename: 'a.png', contentType: 'image/png' }),
        400,
      );
      await check(
        'put',
        AV,
        http()
          .put(AV)
          .set(auth)
          .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1, 1), {
            filename: 'a.jpg',
            contentType: 'image/jpeg',
          }),
        413,
      );
      await check('put', AV, http().put(AV), 401);
      await check(
        'get',
        AV,
        http()
          .get(AV)
          .set(auth)
          .buffer(true)
          .parse((r, cb) => {
            const chunks: Buffer[] = [];
            r.on('data', (c: Buffer) => chunks.push(c));
            r.on('end', () => cb(null, Buffer.concat(chunks)));
          }),
        200,
      );
      await check('delete', AV, http().delete(AV).set(auth), 200);
      await check('delete', AV, http().delete(AV), 401);

      const PW = '/v1/me/password';
      await check(
        'post',
        PW,
        http().post(PW).set(auth).send({ currentPassword: 'x', newPassword: 'short' }),
        400,
      );
      await check('post', PW, http().post(PW).send({}), 401);
      await check(
        'post',
        PW,
        http()
          .post(PW)
          .set(auth)
          .send({ currentPassword: password, newPassword: 'new-password-2026' }),
        204,
      );
    });
  });

  it('draft endpoints match openapi.json', async () => {
    const high = {
      RATE_LIMIT_PER_MIN: '1000',
      AUTH_RATE_LIMIT_PER_MIN: '1000',
      WRITE_RATE_LIMIT_PER_MIN: '1000',
    };
    await withApp(high, async (app) => {
      const http = () => request(app.getHttpServer());
      const check = async (
        method: 'get' | 'post' | 'put' | 'delete',
        template: string,
        req: request.Test,
        status: number,
      ) => {
        const res = await req;
        expect(res.status).toBe(status);
        expectContract(res, method, template);
        return res;
      };
      const customer = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const LIST = '/v1/me/drafts';
      const ONE = '/v1/me/drafts/{id}';

      const created = await check(
        'post',
        LIST,
        http().post(LIST).set(customer.auth).send({ title: 'Черновик', category: 'ELECTRICAL' }),
        201,
      );
      const id = created.body.id as string;
      await check('post', LIST, http().post(LIST).set(customer.auth).send({ budgetMin: -1 }), 400);
      await check('post', LIST, http().post(LIST).send({}), 401);
      await check('post', LIST, http().post(LIST).set(contractor.auth).send({}), 403);

      await check('get', LIST, http().get(LIST).set(customer.auth), 200);
      await check('get', LIST, http().get(LIST), 401);
      await check('get', LIST, http().get(LIST).set(contractor.auth), 403);

      await check('get', ONE, http().get(`${LIST}/${id}`).set(customer.auth), 200);
      await check('get', ONE, http().get(`${LIST}/missing`).set(customer.auth), 404);
      await check('get', ONE, http().get(`${LIST}/${id}`), 401);
      await check('get', ONE, http().get(`${LIST}/${id}`).set(contractor.auth), 403);

      const put = (
        auth?: Record<string, string>,
        body: object = { title: 'Правка' },
        target = id,
      ) => {
        const req = http().put(`${LIST}/${target}`);
        return (auth ? req.set(auth) : req).send(body);
      };
      await check('put', ONE, put(customer.auth), 200);
      await check('put', ONE, put(customer.auth, { title: 'я'.repeat(200) }), 400);
      await check('put', ONE, put(customer.auth, {}, 'missing'), 404);
      // Черновик изменён в другой вкладке: устаревшая версия → 409.
      await check(
        'put',
        ONE,
        put(customer.auth, {
          title: 'Старая вкладка',
          expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
        }),
        409,
      );
      await check('put', ONE, put(), 401);
      await check('put', ONE, put(contractor.auth), 403);

      await check('delete', ONE, http().delete(`${LIST}/missing`).set(customer.auth), 404);
      await check('delete', ONE, http().delete(`${LIST}/${id}`), 401);
      await check('delete', ONE, http().delete(`${LIST}/${id}`).set(contractor.auth), 403);
      await check('delete', ONE, http().delete(`${LIST}/${id}`).set(customer.auth), 204);

      // Лимит черновиков (заполняется напрямую в БД).
      await prisma.jobDraft.createMany({
        data: Array.from({ length: 10 }, () => ({ ownerId: customer.id })),
      });
      await check('post', LIST, http().post(LIST).set(customer.auth).send({}), 409);
    });
  });

  it('plan and stage endpoints match openapi.json', async () => {
    const high = {
      RATE_LIMIT_PER_MIN: '1000',
      AUTH_RATE_LIMIT_PER_MIN: '1000',
      WRITE_RATE_LIMIT_PER_MIN: '1000',
    };
    await withApp(high, async (app) => {
      const http = () => request(app.getHttpServer());
      const check = async (
        method: 'get' | 'post' | 'put',
        template: string,
        req: request.Test,
        status: number,
      ) => {
        const res = await req;
        expect(res.status).toBe(status);
        expectContract(res, method, template);
        return res;
      };
      const owner = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const stranger = await signUp(app, 'CUSTOMER');
      /** Заказ в работе с выбранным исполнителем. */
      const inProgress = async () => {
        const { body: created } = await http().post('/v1/me/jobs').set(owner.auth).send(job);
        const { body: placed } = await http()
          .post(`/v1/jobs/${created.id}/bids`)
          .set(contractor.auth)
          .send(bid);
        await http()
          .post(`/v1/me/jobs/${created.id}/bids/${placed.id}/accept`)
          .set(owner.auth)
          .expect(200);
        return created.id as string;
      };
      const jobId = await inProgress();
      const base = `/v1/jobs/${jobId}`;
      const T = '/v1/jobs/{jobId}';
      const post = (path: string, auth: Record<string, string> | null, body: object = {}) => {
        const req = http().post(`${base}${path}`);
        return (auth ? req.set(auth) : req).send(body);
      };

      // Чтение.
      await check('get', `${T}/plan`, http().get(`${base}/plan`).set(owner.auth), 200);
      await check('get', `${T}/plan`, http().get(`${base}/plan`), 401);
      await check('get', `${T}/plan`, http().get(`${base}/plan`).set(stranger.auth), 404);

      // Черновик плана (составитель — исполнитель).
      const stages = [
        { title: 'Подготовка', description: '', durationDays: 1 },
        { title: 'Основные работы', description: 'Описание', durationDays: null },
      ];
      const put = (auth: Record<string, string> | null, body: object) => {
        const req = http().put(`${base}/plan`);
        return (auth ? req.set(auth) : req).send(body);
      };
      const plan = { version: 0, sequential: true, stages };
      await check(
        'put',
        `${T}/plan`,
        put(contractor.auth, { ...plan, stages: [{ title: 'я' }] }),
        400,
      );
      await check('put', `${T}/plan`, put(null, plan), 401);
      await check('put', `${T}/plan`, put(owner.auth, plan), 403);
      await check('put', `${T}/plan`, put(stranger.auth, plan), 404);
      await check('put', `${T}/plan`, put(contractor.auth, { ...plan, version: 5 }), 409);
      await check('put', `${T}/plan`, put(contractor.auth, plan), 200);

      // Составитель (меняет заказчик).
      const A = `${T}/plan/author`;
      await check('post', A, post('/plan/author', owner.auth, { version: 1, author: 'КТО' }), 400);
      await check('post', A, post('/plan/author', null, { version: 1, author: 'OWNER' }), 401);
      await check(
        'post',
        A,
        post('/plan/author', contractor.auth, { version: 1, author: 'OWNER' }),
        403,
      );
      await check(
        'post',
        A,
        post('/plan/author', stranger.auth, { version: 1, author: 'OWNER' }),
        404,
      );
      await check(
        'post',
        A,
        post('/plan/author', owner.auth, { version: 1, author: 'CONTRACTOR' }),
        200,
      );

      // Отправка, возврат, повторная отправка, согласование.
      const P = `${T}/plan/propose`;
      await check('post', P, post('/plan/propose', contractor.auth, { version: -1 }), 400);
      await check('post', P, post('/plan/propose', null, { version: 1 }), 401);
      await check('post', P, post('/plan/propose', owner.auth, { version: 1 }), 403);
      await check('post', P, post('/plan/propose', stranger.auth, { version: 1 }), 404);
      await check('post', P, post('/plan/propose', contractor.auth, { version: 99 }), 409);
      await check('post', P, post('/plan/propose', contractor.auth, { version: 1 }), 200);

      const R = `${T}/plan/return`;
      const reason = { version: 2, reason: 'Добавьте уборку' };
      await check('post', R, post('/plan/return', owner.auth, { version: 2, reason: 'нет' }), 400);
      await check('post', R, post('/plan/return', null, reason), 401);
      await check('post', R, post('/plan/return', contractor.auth, reason), 403);
      await check('post', R, post('/plan/return', stranger.auth, reason), 404);
      await check('post', R, post('/plan/return', owner.auth, reason), 200);
      await post('/plan/propose', contractor.auth, { version: 3 }).expect(200);
      // План отправлен: составителя не сменить.
      await check(
        'post',
        A,
        post('/plan/author', owner.auth, { version: 4, author: 'OWNER' }),
        409,
      );

      const AP = `${T}/plan/approve`;
      await check('post', AP, post('/plan/approve', owner.auth, { version: 'x' }), 400);
      await check('post', AP, post('/plan/approve', null, { version: 4 }), 401);
      await check('post', AP, post('/plan/approve', contractor.auth, { version: 4 }), 403);
      await check('post', AP, post('/plan/approve', stranger.auth, { version: 4 }), 404);
      await check('post', AP, post('/plan/approve', owner.auth, { version: 99 }), 409);
      const approved = await check(
        'post',
        AP,
        post('/plan/approve', owner.auth, { version: 4 }),
        200,
      );
      await check(
        'post',
        R,
        post('/plan/return', owner.auth, { version: 5, reason: 'Поздно уже' }),
        409,
      );

      // Этапы.
      const [first, second] = approved.body.stages as { id: string }[];
      const S = (id: string, action: string) => `/stages/${id}/${action}`;
      const ST = (action: string) => `${T}/stages/{stageId}/${action}`;
      const done = { comment: 'Этап выполнен' };
      await check(
        'post',
        ST('submit'),
        post(S(first.id, 'submit'), contractor.auth, { comment: 'да' }),
        400,
      );
      await check('post', ST('submit'), post(S(first.id, 'submit'), null, done), 401);
      await check('post', ST('submit'), post(S(first.id, 'submit'), owner.auth, done), 403);
      await check('post', ST('submit'), post(S('missing', 'submit'), contractor.auth, done), 404);
      await check('post', ST('submit'), post(S(second.id, 'submit'), contractor.auth, done), 409);
      await check('post', ST('submit'), post(S(first.id, 'submit'), contractor.auth, done), 200);

      await check('post', ST('accept'), post(S(first.id, 'accept'), null), 401);
      await check('post', ST('accept'), post(S(first.id, 'accept'), contractor.auth), 403);
      await check('post', ST('accept'), post(S('missing', 'accept'), owner.auth), 404);
      await check('post', ST('accept'), post(S(second.id, 'accept'), owner.auth), 409);
      await check('post', ST('accept'), post(S(first.id, 'accept'), owner.auth), 200);

      await post(S(second.id, 'submit'), contractor.auth, done).expect(200);
      const fix = { comment: 'Переделать угол' };
      await check(
        'post',
        ST('rework'),
        post(S(second.id, 'rework'), owner.auth, { comment: '' }),
        400,
      );
      await check('post', ST('rework'), post(S(second.id, 'rework'), null, fix), 401);
      await check('post', ST('rework'), post(S(second.id, 'rework'), contractor.auth, fix), 403);
      await check('post', ST('rework'), post(S('missing', 'rework'), owner.auth, fix), 404);
      await check('post', ST('rework'), post(S(first.id, 'rework'), owner.auth, fix), 409);
      await check('post', ST('rework'), post(S(second.id, 'rework'), owner.auth, fix), 200);

      // Отказ исполнителя.
      const Q = `${T}/quit`;
      const why = { reason: 'Не успеваю по срокам' };
      await check('post', Q, post('/quit', contractor.auth, { reason: 'нет' }), 400);
      await check('post', Q, post('/quit', null, why), 401);
      await check('post', Q, post('/quit', owner.auth, why), 403);
      await check('post', Q, post('/quit', stranger.auth, why), 404);
      // Заказ уже закрыт: отказаться нельзя.
      const closedId = await inProgress();
      await http()
        .post(`/v1/me/jobs/${closedId}/close`)
        .set(owner.auth)
        .send({ outcome: 'COMPLETED' })
        .expect(200);
      await check(
        'post',
        Q,
        http().post(`/v1/jobs/${closedId}/quit`).set(contractor.auth).send(why),
        409,
      );
      await check('post', Q, post('/quit', contractor.auth, why), 204);
    });
  });

  it('message and photo endpoints match openapi.json', async () => {
    const high = {
      RATE_LIMIT_PER_MIN: '1000',
      AUTH_RATE_LIMIT_PER_MIN: '1000',
      WRITE_RATE_LIMIT_PER_MIN: '1000',
    };
    await withApp(high, async (app) => {
      const http = () => request(app.getHttpServer());
      const check = async (
        method: 'get' | 'post',
        template: string,
        req: request.Test,
        status: number,
      ) => {
        const res = await req;
        expect(res.status).toBe(status);
        expectContract(res, method, template);
        return res;
      };
      const owner = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const stranger = await signUp(app, 'CUSTOMER');
      const { body: created } = await http().post('/v1/me/jobs').set(owner.auth).send(job);
      const { body: placed } = await http()
        .post(`/v1/jobs/${created.id}/bids`)
        .set(contractor.auth)
        .send(bid);
      await http()
        .post(`/v1/me/jobs/${created.id}/bids/${placed.id}/accept`)
        .set(owner.auth)
        .expect(200);
      const base = `/v1/jobs/${created.id}`;
      const M = '/v1/jobs/{jobId}/messages';
      const P = '/v1/jobs/{jobId}/photos/{photoId}';
      const photo = await sharp({
        create: { width: 64, height: 48, channels: 3, background: '#c2410c' },
      })
        .jpeg()
        .toBuffer();

      await check('get', M, http().get(`${base}/messages`).set(owner.auth), 200);
      await check('get', M, http().get(`${base}/messages`), 401);
      await check('get', M, http().get(`${base}/messages`).set(stranger.auth), 404);
      await check('get', M, http().get(`${base}/messages?before=a%20b`).set(owner.auth), 400);

      const sent = await check(
        'post',
        M,
        http()
          .post(`${base}/messages`)
          .set(contractor.auth)
          .field('body', 'Фото стены до начала работ')
          .attach('photos', photo, { filename: 'a.jpg', contentType: 'image/jpeg' }),
        200,
      );
      await check(
        'post',
        M,
        http().post(`${base}/messages`).set(owner.auth).send({ body: '' }),
        400,
      );
      await check('post', M, http().post(`${base}/messages`).send({ body: 'Привет' }), 401);
      await check(
        'post',
        M,
        http().post(`${base}/messages`).set(stranger.auth).send({ body: 'Привет' }),
        404,
      );
      await check(
        'post',
        M,
        http()
          .post(`${base}/messages`)
          .set(owner.auth)
          .attach('photos', Buffer.alloc(8 * 1024 * 1024 + 1, 1), {
            filename: 'big.jpg',
            contentType: 'image/jpeg',
          }),
        413,
      );

      const photoId = sent.body.items[0].photos[0].id as string;
      await check('get', P, http().get(`${base}/photos/${photoId}`).set(owner.auth), 200);
      await check('get', P, http().get(`${base}/photos/${photoId}?size=big`).set(owner.auth), 400);
      await check('get', P, http().get(`${base}/photos/${photoId}`), 401);
      await check('get', P, http().get(`${base}/photos/${photoId}`).set(stranger.auth), 404);

      // Сдача этапа с фото: файл больше 8 МБ — 413.
      const draft = await http()
        .put(`${base}/plan`)
        .set(contractor.auth)
        .send({ version: 0, sequential: true, stages: [{ title: 'Работы', description: '' }] })
        .expect(200);
      const proposed = await http()
        .post(`${base}/plan/propose`)
        .set(contractor.auth)
        .send({ version: draft.body.version })
        .expect(200);
      const approved = await http()
        .post(`${base}/plan/approve`)
        .set(owner.auth)
        .send({ version: proposed.body.version })
        .expect(200);
      await check(
        'post',
        '/v1/jobs/{jobId}/stages/{stageId}/submit',
        http()
          .post(`${base}/stages/${approved.body.stages[0].id}/submit`)
          .set(contractor.auth)
          .field('comment', 'Работы выполнены')
          .attach('photos', Buffer.alloc(8 * 1024 * 1024 + 1, 1), {
            filename: 'big.jpg',
            contentType: 'image/jpeg',
          }),
        413,
      );

      // Заказ закрыт — писать нельзя (409).
      await http()
        .post(`/v1/me/jobs/${created.id}/close`)
        .set(owner.auth)
        .send({ outcome: 'COMPLETED' })
        .expect(200);
      await check(
        'post',
        M,
        http().post(`${base}/messages`).set(owner.auth).send({ body: 'Спасибо' }),
        409,
      );

      // Уведомления: у заказчика — отклик с ценой и сообщение, у исполнителя — выбор, план,
      // сообщения и закрытие заказа с исходом.
      const N = '/v1/me/notifications';
      const S = '/v1/me/notifications/summary';
      const R = '/v1/me/notifications/read';
      for (const who of [owner, contractor]) {
        const listed = await check('get', N, http().get(N).set(who.auth), 200);
        expect(listed.body.items.length).toBeGreaterThan(0);
        await check('get', S, http().get(S).set(who.auth), 200);
      }
      await check('get', N, http().get(`${N}?cursor=a%20b`).set(owner.auth), 400);
      await check('get', N, http().get(N), 401);
      await check('get', S, http().get(S), 401);
      await check('post', R, http().post(R).set(owner.auth).send({ jobId: created.id }), 200);
      await check('post', R, http().post(R).set(owner.auth).send({}), 400);
      await check('post', R, http().post(R).send({ all: true }), 401);
    });
  });

  it('moderation endpoints match openapi.json', async () => {
    const high = {
      RATE_LIMIT_PER_MIN: '1000',
      AUTH_RATE_LIMIT_PER_MIN: '1000',
      WRITE_RATE_LIMIT_PER_MIN: '1000',
    };
    await withApp(high, async (app) => {
      const http = () => request(app.getHttpServer());
      const check = async (
        method: 'get' | 'post',
        template: string,
        req: request.Test,
        status: number,
      ) => {
        const res = await req;
        expect(res.status).toBe(status);
        expectContract(res, method, template);
        return res;
      };
      const owner = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const reporter = await signUp(app, 'CONTRACTOR');
      const admin = await signUpAdmin(app, prisma);
      const { body: created } = await http().post('/v1/me/jobs').set(owner.auth).send(job);
      const { body: placed } = await http()
        .post(`/v1/jobs/${created.id}/bids`)
        .set(contractor.auth)
        .send(bid);
      await http()
        .post(`/v1/me/jobs/${created.id}/bids/${placed.id}/accept`)
        .set(owner.auth)
        .expect(200);
      const { body: chat } = await http()
        .post(`/v1/jobs/${created.id}/messages`)
        .set(contractor.auth)
        .send({ body: 'Переведите предоплату на карту' })
        .expect(200);

      const R = '/v1/reports';
      const report = (who: { auth: object } | null, body: object) => {
        const req = http().post(R);
        return (who ? req.set(who.auth as Record<string, string>) : req).send(body);
      };
      const onJob = await check(
        'post',
        R,
        report(reporter, { targetType: 'JOB', targetId: created.id, reason: 'FAKE' }),
        201,
      );
      await check(
        'post',
        R,
        report(owner, {
          targetType: 'MESSAGE',
          targetId: chat.items[0].id,
          reason: 'FRAUD',
          comment: 'Просит предоплату',
        }),
        201,
      );
      await check('post', R, report(reporter, { targetType: 'JOB', reason: 'SPAM' }), 400);
      await check(
        'post',
        R,
        report(null, { targetType: 'JOB', targetId: created.id, reason: 'SPAM' }),
        401,
      );
      await check(
        'post',
        R,
        report(reporter, { targetType: 'BID', targetId: placed.id, reason: 'SPAM' }),
        404,
      );

      const LIST = '/v1/admin/reports';
      await check('get', LIST, http().get(LIST).set(admin.auth), 200);
      await check('get', LIST, http().get(`${LIST}?status=WRONG`).set(admin.auth), 400);
      await check('get', LIST, http().get(LIST), 401);
      await check('get', LIST, http().get(LIST).set(owner.auth), 403);

      const RES = '/v1/admin/reports/{id}/resolve';
      const resolve = (id: string, who: { auth: object } | null, body: object) => {
        const req = http().post(`/v1/admin/reports/${id}/resolve`);
        return (who ? req.set(who.auth as Record<string, string>) : req).send(body);
      };
      const decision = { status: 'DISMISSED', note: 'Заказ настоящий' };
      await check('post', RES, resolve(onJob.body.id, admin, decision), 200);
      await check('post', RES, resolve(onJob.body.id, admin, decision), 409);
      await check('post', RES, resolve(onJob.body.id, admin, { status: 'OPEN', note: 'x' }), 400);
      await check('post', RES, resolve('missing', admin, decision), 404);
      await check('post', RES, resolve(onJob.body.id, null, decision), 401);
      await check('post', RES, resolve(onJob.body.id, owner, decision), 403);

      const hide = { hidden: true, reason: 'Мошенничество в переписке' };
      const act = (path: string, who: { auth: object } | null, body: object) => {
        const req = http().post(path);
        return (who ? req.set(who.auth as Record<string, string>) : req).send(body);
      };
      for (const [template, path] of [
        ['/v1/admin/jobs/{id}/hidden', `/v1/admin/jobs/${created.id}/hidden`],
        ['/v1/admin/messages/{id}/hidden', `/v1/admin/messages/${chat.items[0].id}/hidden`],
      ]) {
        await check('post', template, act(path, admin, hide), 200);
        await check('post', template, act(path, admin, { hidden: true }), 400);
        await check('post', template, act(path, null, hide), 401);
        await check('post', template, act(path, owner, hide), 403);
        await check(
          'post',
          template,
          act(path.replace(/\/[^/]+\/hidden$/, '/missing/hidden'), admin, hide),
          404,
        );
      }
      const BH = '/v1/admin/bids/{id}/hidden';
      await check('post', BH, act(`/v1/admin/bids/${placed.id}/hidden`, admin, hide), 409);
      const other = await signUp(app, 'CONTRACTOR');
      const second = await http().post('/v1/me/jobs').set(owner.auth).send(job);
      const { body: spam } = await http()
        .post(`/v1/jobs/${second.body.id}/bids`)
        .set(other.auth)
        .send(bid);
      await check('post', BH, act(`/v1/admin/bids/${spam.id}/hidden`, admin, hide), 200);
      await check('post', BH, act(`/v1/admin/bids/${spam.id}/hidden`, admin, {}), 400);
      await check('post', BH, act(`/v1/admin/bids/${spam.id}/hidden`, null, hide), 401);
      await check('post', BH, act(`/v1/admin/bids/${spam.id}/hidden`, owner, hide), 403);
      await check('post', BH, act('/v1/admin/bids/missing/hidden', admin, hide), 404);

      const UB = '/v1/admin/users/{id}/blocked';
      const block = { blocked: true, reason: 'Просил предоплату на карту' };
      await check('post', UB, act(`/v1/admin/users/${contractor.id}/blocked`, admin, block), 200);
      await check('post', UB, act(`/v1/admin/users/${contractor.id}/blocked`, admin, {}), 400);
      await check('post', UB, act(`/v1/admin/users/${contractor.id}/blocked`, null, block), 401);
      await check('post', UB, act(`/v1/admin/users/${contractor.id}/blocked`, owner, block), 403);
      await check('post', UB, act('/v1/admin/users/missing/blocked', admin, block), 404);
      await check('post', UB, act(`/v1/admin/users/${admin.id}/blocked`, admin, block), 409);

      // Заблокированный не входит по паролю: 403 только после верного пароля.
      const blockedUser = await prisma.user.findUniqueOrThrow({ where: { id: contractor.id } });
      await check(
        'post',
        '/v1/auth/login',
        http()
          .post('/v1/auth/login')
          .send({ email: blockedUser.email, password: 'correct-horse-battery' }),
        403,
      );
    });
  });

  it('account, review, favorite and flag endpoints match openapi.json', async () => {
    const high = {
      RATE_LIMIT_PER_MIN: '1000',
      AUTH_RATE_LIMIT_PER_MIN: '1000',
      WRITE_RATE_LIMIT_PER_MIN: '1000',
    };
    await withApp(high, async (app) => {
      const http = () => request(app.getHttpServer());
      const check = async (
        method: 'get' | 'post' | 'put' | 'delete',
        template: string,
        req: request.Test,
        status: number,
      ) => {
        const res = await req;
        expect(res.status).toBe(status);
        expectContract(res, method, template);
        return res;
      };
      type Who = { auth: Record<string, string> } | null;
      const as = (req: request.Test, who: Who) => (who ? req.set(who.auth) : req);
      const owner = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const admin = await signUpAdmin(app, prisma);

      // --- сброс пароля по ссылке администратора
      const AU = '/v1/admin/users';
      await check('get', AU, as(http().get(`${AU}?q=Пользователь`), admin), 200);
      await check('get', AU, as(http().get(`${AU}?page=0`), admin), 400);
      await check('get', AU, http().get(AU), 401);
      await check('get', AU, as(http().get(AU), owner), 403);
      const PR = '/v1/admin/users/{id}/password-reset';
      const issue = (id: string, who: Who) =>
        as(http().post(`/v1/admin/users/${id}/password-reset`), who);
      const link = await check('post', PR, issue(owner.id, admin), 201);
      await check('post', PR, issue(owner.id, null), 401);
      await check('post', PR, issue(owner.id, owner), 403);
      await check('post', PR, issue('missing', admin), 404);
      const RESET = '/v1/auth/password-reset';
      const reset = (token: string) =>
        http().post(RESET).send({ token, password: 'new-password-after-reset' });
      const relogged = await check('post', RESET, reset(link.body.token), 200);
      // Смена пароля завершила прежние входы; дальше — с новым.
      owner.auth.Authorization = `Bearer ${relogged.body.token}`;
      await check('post', RESET, reset(link.body.token), 400);
      const blockedLink = await issue(contractor.id, admin).expect(201);
      await http()
        .post(`/v1/admin/users/${contractor.id}/blocked`)
        .set(admin.auth)
        .send({ blocked: true, reason: 'Проверка блокировки' })
        .expect(200);
      await check('post', RESET, reset(blockedLink.body.token), 403);
      await check('post', PR, issue(contractor.id, admin), 409);
      await http()
        .post(`/v1/admin/users/${contractor.id}/blocked`)
        .set(admin.auth)
        .send({ blocked: false, reason: 'Проверка завершена' })
        .expect(200);
      const worker = await http()
        .post('/v1/auth/login')
        .send({
          email: (await prisma.user.findUniqueOrThrow({ where: { id: contractor.id } })).email,
          password: 'correct-horse-battery',
        })
        .expect(200);
      const workerAuth = { auth: { Authorization: `Bearer ${worker.body.token}` } };
      const customer = await signUp(app, 'CUSTOMER');

      // --- сделка с контактами в отклике → пометка автопроверки; выполнение → отзыв
      const { body: created } = await http().post('/v1/me/jobs').set(customer.auth).send(job);
      const { body: placed } = await http()
        .post(`/v1/jobs/${created.id}/bids`)
        .set(workerAuth.auth)
        .send({ ...bid, comment: 'Звоните +7 999 123-45-67, договоримся напрямую.' })
        .expect(201);
      const REV = '/v1/me/jobs/{jobId}/review';
      const review = (who: Who, body: object, id = created.id) =>
        as(http().post(`/v1/me/jobs/${id}/review`), who).send(body);
      const state = (who: Who, id = created.id) => as(http().get(`/v1/me/jobs/${id}/review`), who);
      await check('post', REV, review(customer, { rating: 5, text: 'Рано' }), 409);
      await http()
        .post(`/v1/me/jobs/${created.id}/bids/${placed.id}/accept`)
        .set(customer.auth)
        .expect(200);
      await http()
        .post(`/v1/me/jobs/${created.id}/close`)
        .set(customer.auth)
        .send({ outcome: 'COMPLETED' })
        .expect(200);
      await check('get', REV, state(customer), 200);

      // --- обмен контактами по согласию сторон сделки
      const CT = '/v1/jobs/{jobId}/contacts';
      const contactsAt = (method: 'get' | 'put' | 'delete', who: Who, id = created.id) =>
        as(http()[method](`/v1/jobs/${id}/contacts`), who);
      for (const method of ['get', 'put', 'delete'] as const) {
        await check(method, CT, contactsAt(method, workerAuth), 200);
        await check(method, CT, contactsAt(method, null), 401);
        await check(method, CT, contactsAt(method, owner), 404);
      }
      const opened = await check('put', CT, contactsAt('put', workerAuth), 200);
      expect(opened.body.mySharedAt).toEqual(expect.any(String));
      const seen = await check('get', CT, contactsAt('get', customer), 200);
      expect(seen.body.theirs).toEqual(expect.objectContaining({ phone: null }));
      await check('get', REV, state(null), 401);
      await check('get', REV, state(workerAuth), 403);
      await check('get', REV, state(customer, 'missing'), 404);
      await check('post', REV, review(customer, { rating: 9 }), 400);
      const written = await check(
        'post',
        REV,
        review(customer, { rating: 5, text: 'Всё сделано в срок, аккуратно.' }),
        201,
      );
      await check('post', REV, review(customer, { rating: 4 }), 409);
      await check('post', REV, review(null, { rating: 4 }), 401);
      await check('post', REV, review(workerAuth, { rating: 4 }), 403);
      await check('post', REV, review(customer, { rating: 4 }, 'missing'), 404);

      const workerUser = await prisma.user.findUniqueOrThrow({ where: { id: contractor.id } });
      const PC = '/v1/contractors/{publicId}';
      await check('get', PC, http().get(`/v1/contractors/${workerUser.publicId}`), 200);
      await check('get', PC, http().get(`/v1/contractors/${workerUser.publicId}?page=0`), 400);
      await check('get', PC, http().get('/v1/contractors/1'), 404);

      const RH = '/v1/admin/reviews/{id}/hidden';
      const hideReview = (id: string, who: Who, body: object) =>
        as(http().post(`/v1/admin/reviews/${id}/hidden`), who).send(body);
      const hide = { hidden: true, reason: 'Отзыв с оскорблениями' };
      await check('post', RH, hideReview(written.body.id, admin, hide), 200);
      await check('post', RH, hideReview(written.body.id, admin, {}), 400);
      await check('post', RH, hideReview(written.body.id, null, hide), 401);
      await check('post', RH, hideReview(written.body.id, owner, hide), 403);
      await check('post', RH, hideReview('missing', admin, hide), 404);

      const AN = '/v1/admin/analytics';
      await check('get', AN, as(http().get(`${AN}?days=7`), admin), 200);
      await check('get', AN, as(http().get(`${AN}?days=5`), admin), 400);
      await check('get', AN, http().get(AN), 401);
      await check('get', AN, as(http().get(AN), owner), 403);

      const FL = '/v1/admin/flags';
      const flags = await check('get', FL, as(http().get(FL), admin), 200);
      expect(flags.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ targetId: placed.id })]),
      );
      await check('get', FL, as(http().get(`${FL}?status=WRONG`), admin), 400);
      await check('get', FL, http().get(FL), 401);
      await check('get', FL, as(http().get(FL), owner), 403);
      const flagId = flags.body.items.find((f: { targetId: string }) => f.targetId === placed.id)
        .id as string;
      const FR = '/v1/admin/flags/{id}/resolve';
      const resolveFlag = (id: string, who: Who, body: object) =>
        as(http().post(`/v1/admin/flags/${id}/resolve`), who).send(body);
      await check('post', FR, resolveFlag(flagId, admin, { status: 'RESOLVED' }), 200);
      await check('post', FR, resolveFlag(flagId, admin, { status: 'RESOLVED' }), 409);
      await check('post', FR, resolveFlag(flagId, admin, { status: 'OPEN' }), 400);
      await check('post', FR, resolveFlag(flagId, null, { status: 'RESOLVED' }), 401);
      await check('post', FR, resolveFlag(flagId, owner, { status: 'RESOLVED' }), 403);
      await check('post', FR, resolveFlag('missing', admin, { status: 'RESOLVED' }), 404);

      // --- свои жалобы и решения
      const { body: second } = await http().post('/v1/me/jobs').set(customer.auth).send(job);
      const { body: filed } = await http()
        .post('/v1/reports')
        .set(owner.auth)
        .send({ targetType: 'JOB', targetId: second.id, reason: 'FAKE' })
        .expect(201);
      await http()
        .post(`/v1/admin/reports/${filed.id}/resolve`)
        .set(admin.auth)
        .send({ status: 'DISMISSED', note: 'Заказ настоящий' })
        .expect(200);
      const MINE = '/v1/reports/mine';
      const mine = await check('get', MINE, as(http().get(MINE), owner), 200);
      expect(mine.body.items[0]).toMatchObject({ id: filed.id, unseen: true });
      await check('get', MINE, as(http().get(`${MINE}?page=0`), owner), 400);
      await check('get', MINE, http().get(MINE), 401);
      const SEEN = '/v1/reports/mine/seen';
      await check('post', SEEN, as(http().post(SEEN), owner), 204);
      await check('post', SEEN, http().post(SEEN), 401);

      // --- избранное
      const FAV = '/v1/me/favorites';
      const FJ = '/v1/me/favorites/{jobId}';
      await check('put', FJ, as(http().put(`${FAV}/${second.id}`), owner), 200);
      await check('put', FJ, http().put(`${FAV}/${second.id}`), 401);
      await check('put', FJ, as(http().put(`${FAV}/missing`), owner), 404);
      await prisma.favoriteJob.createMany({
        data: (
          await prisma.job
            .createMany({
              data: Array.from({ length: 200 }, (_, i) => ({
                ...job,
                title: `Заказ для избранного ${i}`,
                category: 'ELECTRICAL' as const,
                ownerId: customer.id,
              })),
            })
            .then(() =>
              prisma.job.findMany({
                where: { ownerId: customer.id, title: { startsWith: 'Заказ для избранного' } },
                select: { id: true },
              }),
            )
        ).map((j) => ({ userId: workerUser.id, jobId: j.id })),
      });
      await check('put', FJ, as(http().put(`${FAV}/${second.id}`), workerAuth), 409);
      await check('get', FAV, as(http().get(FAV), owner), 200);
      await check('get', FAV, as(http().get(`${FAV}?page=0`), owner), 400);
      await check('get', FAV, http().get(FAV), 401);
      const IDS = '/v1/me/favorites/ids';
      await check('get', IDS, as(http().get(IDS), owner), 200);
      await check('get', IDS, http().get(IDS), 401);
      await check('delete', FJ, as(http().delete(`${FAV}/${second.id}`), owner), 200);
      await check('delete', FJ, http().delete(`${FAV}/${second.id}`), 401);
      await check('delete', FJ, as(http().delete(`${FAV}/bad%20id`), owner), 404);
    });
  });

  it('lead endpoints match openapi.json', async () => {
    const high = {
      RATE_LIMIT_PER_MIN: '1000',
      AUTH_RATE_LIMIT_PER_MIN: '1000',
      WRITE_RATE_LIMIT_PER_MIN: '1000',
    };
    const lead = { name: 'Ирина', phone: '8 (912) 345-67-89', consent: true };

    // Пока нет реквизитов оператора, приём выключен.
    await withApp(high, async (app) => {
      const res = await request(app.getHttpServer()).post('/v1/leads').send(lead);
      expect(res.status).toBe(503);
      expectContract(res, 'post', '/v1/leads');
    });

    await withApp(
      high,
      async (app) => {
        const http = () => request(app.getHttpServer());
        const check = async (
          method: 'get' | 'post' | 'patch',
          template: string,
          req: request.Test,
          status: number,
        ) => {
          const res = await req;
          expect(res.status).toBe(status);
          expectContract(res, method, template);
          return res;
        };

        await check('post', '/v1/leads', http().post('/v1/leads').send(lead), 201);
        await check(
          'post',
          '/v1/leads',
          http()
            .post('/v1/leads')
            .send({ ...lead, phone: '12345' }),
          400,
        );

        const adminAuth = (await signUpAdmin(app, prisma)).auth;
        const customer = await signUp(app, 'CUSTOMER');

        const LIST = '/v1/admin/leads';
        const listed = await check('get', LIST, http().get(LIST).set(adminAuth), 200);
        await check('get', LIST, http().get(`${LIST}?status=bad`).set(adminAuth), 400);
        await check('get', LIST, http().get(LIST), 401);
        await check('get', LIST, http().get(LIST).set(customer.auth), 403);

        const ONE = '/v1/admin/leads/{id}';
        const url = `${LIST}/${listed.body.items[0].id}`;
        await check('patch', ONE, http().patch(url).set(adminAuth).send({ processed: true }), 200);
        await check('patch', ONE, http().patch(url).set(adminAuth).send({ processed: 'yes' }), 400);
        await check(
          'patch',
          ONE,
          http().patch(`${LIST}/missing`).set(adminAuth).send({ processed: true }),
          404,
        );
        await check('patch', ONE, http().patch(url).send({ processed: true }), 401);
        await check(
          'patch',
          ONE,
          http().patch(url).set(customer.auth).send({ processed: true }),
          403,
        );
      },
      { leadsEnabled: true },
    );
  });

  it('bank login endpoints match openapi.json', async () => {
    const bank = await startFakeBank();
    const high = { RATE_LIMIT_PER_MIN: '1000', AUTH_RATE_LIMIT_PER_MIN: '1000' };
    try {
      await withApp(
        high,
        async (app) => {
          const http = () => request(app.getHttpServer());
          const check = async (
            method: 'get' | 'post',
            template: string,
            req: request.Test,
            status: number,
          ) => {
            const res = await req;
            expect(res.status).toBe(status);
            expectContract(res, method, template);
            return res;
          };
          const authorize = { state: STATE, nonce: NONCE, codeChallenge: CHALLENGE };
          const code = (user: { sub: string; email?: string }, extra = {}) => ({
            code: bank.grant(user, extra),
            codeVerifier: VERIFIER,
            nonce: NONCE,
          });

          await check(
            'get',
            '/v1/auth/oauth/providers',
            http().get('/v1/auth/oauth/providers'),
            200,
          );

          const AUTH = '/v1/auth/oauth/{provider}/authorize';
          await check(
            'post',
            AUTH,
            http().post('/v1/auth/oauth/sber/authorize').send(authorize),
            200,
          );
          await check('post', AUTH, http().post('/v1/auth/oauth/sber/authorize').send({}), 400);
          await check(
            'post',
            AUTH,
            http().post('/v1/auth/oauth/vk/authorize').send(authorize),
            404,
          );

          const CB = '/v1/auth/oauth/{provider}/callback';
          const cb = (provider: string, body: object) =>
            http().post(`/v1/auth/oauth/${provider}/callback`).send(body);
          await check(
            'post',
            CB,
            cb('sber', { ...code({ sub: 'c-1', email: 'c1@example.ru' }), role: 'CUSTOMER' }),
            200,
          );
          await check(
            'post',
            CB,
            cb('sber', { code: 'bad code', codeVerifier: VERIFIER, nonce: NONCE }),
            400,
          );
          await check('post', CB, cb('vk', code({ sub: 'x' })), 404);
          const needRole = await check(
            'post',
            CB,
            cb('tbank', code({ sub: 't-1', email: 't1@example.ru' })),
            409,
          );
          await check(
            'post',
            CB,
            cb('sber', { ...code({ sub: 'no-mail' }), role: 'CUSTOMER' }),
            422,
          );
          await check(
            'post',
            CB,
            cb('sber', code({ sub: 'c-2', email: 'c2@example.ru' }, { nonce: 'x'.repeat(32) })),
            502,
          );

          const DONE = '/v1/auth/oauth/complete';
          const done = (body: object) => http().post(DONE).send(body);
          await check('post', DONE, done({ pending: needRole.body.pending, role: 'ADMIN' }), 400);
          await check(
            'post',
            DONE,
            done({ pending: `${needRole.body.pending}x`, role: 'CUSTOMER' }),
            410,
          );
          // Email заняли регистрацией по паролю, пока человек выбирал роль.
          const taken = await http()
            .post('/v1/auth/oauth/tbank/callback')
            .send(code({ sub: 't-2', email: 'taken@example.ru' }));
          await http()
            .post('/v1/auth/register')
            .send({
              email: 'taken@example.ru',
              password: 'correct-horse-battery',
              name: 'Занят',
              role: 'CUSTOMER',
            })
            .expect(201);
          await check('post', DONE, done({ pending: taken.body.pending, role: 'CUSTOMER' }), 409);
          await check(
            'post',
            DONE,
            done({ pending: needRole.body.pending, role: 'CONTRACTOR' }),
            201,
          );

          const user = await signUp(app, 'CUSTOMER');
          const other = await signUp(app, 'CUSTOMER');
          await check('get', '/v1/me/oauth', http().get('/v1/me/oauth').set(user.auth), 200);
          await check('get', '/v1/me/oauth', http().get('/v1/me/oauth'), 401);
          const LINK = '/v1/me/oauth/{provider}/link';
          const link = (provider: string, auth: object | null, body: object) => {
            const req = http().post(`/v1/me/oauth/${provider}/link`);
            return (auth ? req.set(auth as Record<string, string>) : req).send(body);
          };
          await check('post', LINK, link('sber', user.auth, code({ sub: 'link-1' })), 204);
          await check('post', LINK, link('sber', user.auth, {}), 400);
          await check('post', LINK, link('sber', null, code({ sub: 'link-2' })), 401);
          await check('post', LINK, link('vk', user.auth, code({ sub: 'link-3' })), 404);
          await check('post', LINK, link('sber', other.auth, code({ sub: 'link-1' })), 409);
          // Заблокированный аккаунт: вход через привязанный банк и завершение входа — 403.
          const blockedPending = await http()
            .post('/v1/auth/oauth/sber/callback')
            .send(code({ sub: 'blk-1', email: 'blk1@example.ru' }))
            .expect(409);
          await link('sber', other.auth, code({ sub: 'blk-1' })).expect(204);
          await prisma.user.update({ where: { id: other.id }, data: { blockedAt: new Date() } });
          await check('post', CB, cb('sber', code({ sub: 'blk-1' })), 403);
          await check(
            'post',
            DONE,
            done({ pending: blockedPending.body.pending, role: 'CUSTOMER' }),
            403,
          );
          bank.setTokenStatus(500);
          await check('post', LINK, link('tbank', user.auth, code({ sub: 'link-4' })), 502);
        },
        { oauth: bank.config },
      );
    } finally {
      await bank.close();
    }
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

  it('readiness reports 503 when the database does not answer', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: () => Promise.reject(new Error('connection refused')) },
        },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    try {
      const res = await request(app.getHttpServer()).get('/health/ready');
      expect(res.status).toBe(503);
      expectContract(res, 'get', '/health/ready');
    } finally {
      await app.close();
    }
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
