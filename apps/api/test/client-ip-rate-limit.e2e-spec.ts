import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './create-app';

/**
 * Схема web → API: web передаёт IP посетителя в X-Forwarded-For, API доверяет заголовку
 * только от адресов из TRUST_PROXY (здесь loopback — так в тестах выглядит сервер web).
 */
const LIMIT = 3;

// Каждая попытка — на свой адрес: здесь проверяется лимит по IP, а серия неверных паролей к
// одному адресу (своя защита, login-throttle.e2e-spec.ts) не должна вмешиваться.
let attempts = 0;
const attempt = (app: NestExpressApplication, forwardedFor?: string) => {
  attempts += 1;
  const req = request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: `victim-${attempts}@example.ru`, password: 'guess-password-1' });
  return forwardedFor ? req.set('X-Forwarded-For', forwardedFor) : req;
};

async function exhaust(app: NestExpressApplication, forwardedFor?: string) {
  for (let i = 0; i < LIMIT; i += 1) {
    await attempt(app, forwardedFor).expect(401);
  }
}

describe('Client IP and auth rate limit (e2e)', () => {
  beforeAll(() => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = String(LIMIT);
  });

  afterAll(() => {
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
  });

  describe('TRUST_PROXY=loopback (API behind web)', () => {
    let app: NestExpressApplication;

    beforeEach(async () => {
      app = await createTestApp(['loopback']);
    });

    afterEach(async () => {
      await app.close();
    });

    it('keeps separate limits for different visitors', async () => {
      await exhaust(app, '203.0.113.1');
      await attempt(app, '203.0.113.1').expect(429);
      await attempt(app, '203.0.113.2').expect(401);
    });

    it('cannot be bypassed by spoofing earlier X-Forwarded-For entries', async () => {
      await exhaust(app, '203.0.113.1');
      // Клиент дописал «свои» адреса впереди: API берёт крайний правый недоверенный адрес.
      await attempt(app, '198.51.100.7, 203.0.113.1').expect(429);
      await attempt(app, '198.51.100.8, 198.51.100.9, 203.0.113.1').expect(429);
    });
  });

  describe('TRUST_PROXY not set (API exposed directly)', () => {
    let app: NestExpressApplication;

    beforeEach(async () => {
      app = await createTestApp(false);
    });

    afterEach(async () => {
      await app.close();
    });

    it('ignores X-Forwarded-For entirely, so rotating it does not reset the limit', async () => {
      await exhaust(app, '203.0.113.1');
      await attempt(app, '203.0.113.2').expect(429);
      await attempt(app).expect(429);
    });
  });
});
