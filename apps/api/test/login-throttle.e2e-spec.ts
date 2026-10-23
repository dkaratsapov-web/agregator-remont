import { LOGIN_THROTTLE, loginDelaySeconds } from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginKey } from '../src/auth/login-throttle';
import { CleanupService } from '../src/maintenance/cleanup.service';
import { createTestApp } from './create-app';
import { signUp } from './helpers';

const prisma = new PrismaClient();
const PASSWORD = 'correct-horse-battery';
const WRONG = 'wrong-password-123';

describe('Login throttling per address and scheduled cleanup (e2e, release gate 2 and 5)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const login = (email: string, password: string) =>
    http().post('/v1/auth/login').send({ email, password });

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.CLEANUP_INTERVAL_MIN = '0';
    app = await createTestApp();
  });

  const clean = async () => {
    await prisma.loginFailure.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  };
  beforeEach(clean);

  afterAll(async () => {
    await clean();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
    delete process.env.CLEANUP_INTERVAL_MIN;
  });

  const emailOf = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id } })).email;
  /** Отмотать последнюю ошибку серии назад: пауза прошла, а новый тест не ждёт по-настоящему. */
  const rewind = (email: string, seconds: number) =>
    prisma.loginFailure.update({
      where: { emailHash: loginKey(email) },
      data: { lastAt: new Date(Date.now() - seconds * 1000) },
    });

  it('after five wrong passwords the next attempt waits, even with the right password', async () => {
    const user = await signUp(app, 'CUSTOMER');
    const email = await emailOf(user.id);
    for (let i = 0; i < LOGIN_THROTTLE.FREE_FAILURES; i += 1) {
      const res = await login(email, WRONG);
      expect(res.status).toBe(401);
    }
    const throttled = await login(email, PASSWORD);
    expect(throttled.status).toBe(429);
    expect(throttled.body.code).toBe('LOGIN_THROTTLED');
    expect(Number(throttled.headers['retry-after'])).toBe(LOGIN_THROTTLE.BASE_DELAY_S);
    expect(throttled.body.message).toMatch(/Повторите через 2 с/);

    // Пауза прошла: верный пароль впускает и обнуляет серию.
    await rewind(email, LOGIN_THROTTLE.BASE_DELAY_S + 1);
    await login(email, PASSWORD).expect(200);
    expect(await prisma.loginFailure.count()).toBe(0);
  });

  it('a missing address is throttled the same way, so answers do not reveal accounts', async () => {
    const answers = async (email: string) => {
      const codes: number[] = [];
      for (let i = 0; i < LOGIN_THROTTLE.FREE_FAILURES + 1; i += 1) {
        codes.push((await login(email, WRONG)).status);
      }
      return codes;
    };
    const user = await signUp(app, 'CUSTOMER');
    const real = await answers(await emailOf(user.id));
    const missing = await answers('nobody-here@example.ru');
    expect(real).toEqual([401, 401, 401, 401, 401, 429]);
    expect(missing).toEqual(real);
    // Адрес не хранится, только его хеш.
    const rows = await prisma.loginFailure.findMany();
    expect(rows.map((r) => r.emailHash)).toContain(loginKey('nobody-here@example.ru'));
    expect(JSON.stringify(rows)).not.toContain('nobody-here');
  });

  it('one address being attacked does not slow down another', async () => {
    const victim = await signUp(app, 'CUSTOMER');
    const other = await signUp(app, 'CUSTOMER');
    for (let i = 0; i < LOGIN_THROTTLE.FREE_FAILURES; i += 1) {
      await login(await emailOf(victim.id), WRONG).expect(401);
    }
    await login(await emailOf(victim.id), WRONG).expect(429);
    await login(await emailOf(other.id), PASSWORD).expect(200);
  });

  it('the pause doubles and stops at the cap; an old series starts again', async () => {
    expect([4, 5, 6, 7, 8, 9, 10, 11, 50].map((failures) => loginDelaySeconds(failures))).toEqual([
      0, 2, 4, 8, 16, 32, 60, 60, 60,
    ]);
    const email = 'series@example.ru';
    await prisma.loginFailure.create({
      data: {
        emailHash: loginKey(email),
        failures: 40,
        lastAt: new Date(Date.now() - (LOGIN_THROTTLE.WINDOW_MIN * 60 + 1) * 1000),
      },
    });
    // Серия старше окна не мешает и начинается заново.
    await login(email, WRONG).expect(401);
    expect(
      (await prisma.loginFailure.findUniqueOrThrow({ where: { emailHash: loginKey(email) } }))
        .failures,
    ).toBe(1);
  });

  it('the current password in account settings shares the series with login', async () => {
    const user = await signUp(app, 'CUSTOMER');
    const email = await emailOf(user.id);
    const change = (currentPassword: string) =>
      http()
        .post('/v1/me/password')
        .set(user.auth)
        .send({ currentPassword, newPassword: 'brand-new-password-1' });
    // Тот, кто завладел открытой сессией, подбирает пароль через смену: серия та же, что у входа.
    for (let i = 0; i < LOGIN_THROTTLE.FREE_FAILURES - 1; i += 1) {
      expect((await change(WRONG)).status).toBe(400);
    }
    expect((await login(email, WRONG)).status).toBe(401);
    const throttled = await change(PASSWORD);
    expect(throttled.status).toBe(429);
    expect(throttled.body.code).toBe('LOGIN_THROTTLED');
    expect(throttled.body.message).toMatch(/текущий пароль/);
    expect(Number(throttled.headers['retry-after'])).toBe(LOGIN_THROTTLE.BASE_DELAY_S);
    expect((await login(email, PASSWORD)).status).toBe(429);
    // Во время паузы пароль не сменился.
    await rewind(email, LOGIN_THROTTLE.BASE_DELAY_S + 1);
    await change(PASSWORD).expect(204);
    expect(await prisma.loginFailure.count()).toBe(0);
    await login(email, 'brand-new-password-1').expect(200);
  });

  it('scheduled cleanup removes expired sessions, old reset links and finished series only', async () => {
    const user = await signUp(app, 'CUSTOMER');
    const now = new Date();
    const day = 86_400_000;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: 'e'.repeat(64),
        expiresAt: new Date(now.getTime() - 1000),
      },
    });
    await prisma.passwordReset.createMany({
      data: [
        {
          userId: user.id,
          tokenHash: 'a'.repeat(64),
          createdAt: new Date(now.getTime() - 10 * day),
          expiresAt: new Date(now.getTime() - 9 * day),
        },
        {
          userId: user.id,
          tokenHash: 'b'.repeat(64),
          expiresAt: new Date(now.getTime() + day),
        },
      ],
    });
    await prisma.loginFailure.createMany({
      data: [
        { emailHash: 'c'.repeat(64), failures: 3, lastAt: new Date(now.getTime() - day) },
        { emailHash: 'd'.repeat(64), failures: 3, lastAt: now },
      ],
    });
    const done = await app.get(CleanupService).run(now);
    expect(done).toEqual({ sessions: 1, passwordResets: 1, loginFailures: 1 });
    // Действующая сессия из регистрации, свежая ссылка и текущая серия остались.
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.passwordReset.count()).toBe(1);
    expect(await prisma.loginFailure.count()).toBe(1);
  });
});
