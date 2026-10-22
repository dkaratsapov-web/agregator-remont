import { API_ERROR_CODES } from '@agregator/shared';
import { Controller, Get, Module } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { setupApp } from '../src/setup-app';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp } from './helpers';

const prisma = new PrismaClient();
const PASSWORD = 'correct-horse-battery';
const jobBody = {
  title: 'Замена смесителя на кухне',
  description: 'Старый смеситель течёт, новый уже куплен, нужна установка.',
  category: 'OTHER',
  details: requiredAnswers('OTHER'),
  city: 'Москва',
};
const bidBody = { price: 3_000, durationDays: 1, comment: 'Поставлю за час, инструмент свой.' };

/** Тело ошибки в едином формате ADR 0002: code всегда, error — имя статуса. */
const expectError = (res: request.Response, status: number, code: string) => {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toMatchObject({ statusCode: status, code });
  expect(typeof res.body.error).toBe('string');
  expect(res.body.message).toBeDefined();
};

describe('API error format with machine codes (e2e, ADR 0002)', () => {
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

  it('validation: VALIDATION_FAILED with a field path for each message, nested and unknown fields', async () => {
    const res = await http()
      .post('/v1/auth/register')
      .send({ email: 'не почта', password: PASSWORD, name: 'Иван', role: 'CUSTOMER', admin: true });
    expectError(res, 400, 'VALIDATION_FAILED');
    expect(res.body.fieldErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'email', code: 'INVALID' }),
        expect.objectContaining({ path: 'admin', code: 'UNKNOWN_FIELD' }),
      ]),
    );
    // message — те же тексты, что в fieldErrors (прежний web показывает массив как есть).
    expect(res.body.message).toEqual(
      res.body.fieldErrors.map((f: { message: string }) => f.message),
    );

    const owner = await signUp(app, 'CUSTOMER');
    const nested = await http()
      .put('/v1/jobs/any-job/plan')
      .set(owner.auth)
      .send({ version: 0, sequential: true, stages: [{}, { title: 1 }] });
    expectError(nested, 400, 'VALIDATION_FAILED');
    const paths = nested.body.fieldErrors.map((f: { path: string }) => f.path);
    expect(paths).toContain('stages.1.title');
    // Текст — для человека, без технического пути.
    expect(nested.body.message.every((m: string) => !m.startsWith('stages.'))).toBe(true);
  });

  it('domain codes: budget, empty update, email taken, credentials, session, role, not found', async () => {
    const owner = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');
    expectError(
      await http()
        .post('/v1/me/jobs')
        .set(owner.auth)
        .send({ ...jobBody, budgetMin: 50_000, budgetMax: 10_000 }),
      400,
      'BUDGET_RANGE_INVALID',
    );
    const { body: job } = await http().post('/v1/me/jobs').set(owner.auth).send(jobBody);
    expectError(
      await http().patch(`/v1/me/jobs/${job.id}`).set(owner.auth).send({}),
      400,
      'NO_FIELDS_TO_UPDATE',
    );

    const { email } = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    const taken = await http()
      .post('/v1/auth/register')
      .send({ email, password: PASSWORD, name: 'Двойник', role: 'CUSTOMER' });
    expectError(taken, 409, 'EMAIL_TAKEN');
    // Ни email, ни хешей в теле ошибки.
    expect(taken.text).not.toContain(email);
    expect(taken.text).not.toContain('argon2');
    expectError(
      await http().post('/v1/auth/login').send({ email, password: 'wrong-password-123' }),
      401,
      'INVALID_CREDENTIALS',
    );
    expectError(await http().get('/v1/me'), 401, 'UNAUTHENTICATED');
    expectError(
      await http().post('/v1/me/jobs').set(contractor.auth).send(jobBody),
      403,
      'FORBIDDEN_ROLE',
    );
    expectError(await http().get('/v1/jobs/no-such-job'), 404, 'NOT_FOUND');
    expectError(await http().get('/v1/no/such/route'), 404, 'NOT_FOUND');
  });

  it('deal conflicts: bid exists, bid not pending, job not open, job already closed', async () => {
    const owner = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');
    const { body: job } = await http().post('/v1/me/jobs').set(owner.auth).send(jobBody);
    const { body: bid } = await http()
      .post(`/v1/jobs/${job.id}/bids`)
      .set(contractor.auth)
      .send(bidBody)
      .expect(201);
    expectError(
      await http().post(`/v1/jobs/${job.id}/bids`).set(contractor.auth).send(bidBody),
      409,
      'BID_ALREADY_EXISTS',
    );
    await http().post(`/v1/me/bids/${bid.id}/withdraw`).set(contractor.auth).expect(200);
    expectError(
      await http().post(`/v1/me/bids/${bid.id}/withdraw`).set(contractor.auth),
      409,
      'BID_NOT_PENDING',
    );
    await http()
      .post(`/v1/me/jobs/${job.id}/close`)
      .set(owner.auth)
      .send({ outcome: 'CANCELLED' })
      .expect(200);
    expectError(
      await http()
        .post(`/v1/me/jobs/${job.id}/close`)
        .set(owner.auth)
        .send({ outcome: 'CANCELLED' }),
      409,
      'JOB_ALREADY_CLOSED',
    );
    expectError(
      await http().patch(`/v1/me/jobs/${job.id}`).set(owner.auth).send({ title: 'Новое название' }),
      409,
      'JOB_NOT_OPEN',
    );
    const other = await signUp(app, 'CONTRACTOR');
    expectError(
      await http().post(`/v1/jobs/${job.id}/bids`).set(other.auth).send(bidBody),
      409,
      'JOB_NOT_OPEN',
    );
  });

  it('daily quota: DAILY_QUOTA_EXCEEDED with Retry-After until the oldest entry leaves the window', async () => {
    const owner = await signUp(app, 'CUSTOMER');
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.job.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        title: `Заказ ${i}`,
        description: jobBody.description,
        city: jobBody.city,
        category: 'OTHER' as const,
        categories: ['OTHER' as const],
        ownerId: owner.id,
        createdAt: new Date(hourAgo.getTime() + i * 1000),
      })),
    });
    const res = await http().post('/v1/me/jobs').set(owner.auth).send(jobBody);
    expectError(res, 429, 'DAILY_QUOTA_EXCEEDED');
    const wait = Number(res.headers['retry-after']);
    // Самый старый — час назад: освободится примерно через 23 часа.
    expect(wait).toBeGreaterThan(22 * 3600);
    expect(wait).toBeLessThanOrEqual(23 * 3600 + 60);
  });

  it('body problems keep their status: broken JSON 400, too large 413', async () => {
    const owner = await signUp(app, 'CUSTOMER');
    expectError(
      await http()
        .post('/v1/me/jobs')
        .set(owner.auth)
        .set('Content-Type', 'application/json')
        .send('{"title": '),
      400,
      'BAD_REQUEST',
    );
    expectError(
      await http()
        .post('/v1/me/jobs')
        .set(owner.auth)
        .send({ ...jobBody, description: 'x'.repeat(2_000_000) }),
      413,
      'PAYLOAD_TOO_LARGE',
    );
  });

  it('rate limit: RATE_LIMITED with the standard Retry-After', async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '2';
    const limited = await createTestApp();
    try {
      const login = () =>
        request(limited.getHttpServer())
          .post('/v1/auth/login')
          .send({ email: 'nobody@example.ru', password: 'wrong-password-123' });
      await login();
      await login();
      const res = await login();
      expectError(res, 429, 'RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await limited.close();
      process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    }
  });

  it('unexpected errors: 500 INTERNAL and 503 UNAVAILABLE without details', async () => {
    @Controller('boom')
    class BoomController {
      @Get('internal')
      internal(): never {
        throw new Error('SELECT password_hash FROM users WHERE email = secret@example.ru');
      }

      @Get('db')
      db(): never {
        throw new Prisma.PrismaClientInitializationError("Can't reach database server", '6.0.0');
      }
    }
    @Module({ controllers: [BoomController] })
    class BoomModule {}
    const moduleRef = await Test.createTestingModule({ imports: [BoomModule] }).compile();
    const boom = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(boom, { corsOrigins: [], trustProxy: false });
    await boom.init();
    try {
      const internal = await request(boom.getHttpServer()).get('/boom/internal');
      expectError(internal, 500, 'INTERNAL');
      expect(internal.text).not.toMatch(/password_hash|secret@|SELECT|at /);
      const db = await request(boom.getHttpServer()).get('/boom/db');
      expectError(db, 503, 'UNAVAILABLE');
      expect(db.text).not.toContain('database server');
    } finally {
      await boom.close();
    }
  });

  it('every code in the shared catalog is a known string', () => {
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
    for (const code of API_ERROR_CODES) expect(code).toMatch(/^[A-Z_]+$/);
  });
});
