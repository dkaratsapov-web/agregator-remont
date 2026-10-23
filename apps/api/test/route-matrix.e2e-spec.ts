import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { createTestApp } from './create-app';
import { signUp, signUpAdmin } from './helpers';

/**
 * Матрица всех маршрутов API (аудит 23.10.2026, P1): список берётся из openapi.json, а не
 * пишется вручную, поэтому новый маршрут попадает в проверку сам.
 * - Маршрут с `security` без сессии отвечает 401.
 * - Маршрут /v1/admin/* отвечает 403 заказчику и подрядчику.
 * - Маршрут без `security` (открытый) должен быть в PUBLIC: новый открытый маршрут — осознанное
 *   решение, а не забытый guard.
 * Чужие объекты (IDOR) по ролям проверяет access-matrix.e2e-spec.ts.
 */

type Operation = { security?: unknown[] };
const spec = JSON.parse(readFileSync(join(__dirname, '..', 'openapi.json'), 'utf8')) as {
  paths: Record<string, Record<string, Operation>>;
};

const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, op]) => ({
    method,
    path,
    // Параметры пути — заведомо несуществующие id: guard должен отказать раньше поиска.
    url: path.replace(/\{[^}]+\}/g, 'x'),
    secured: Array.isArray(op.security) && op.security.length > 0,
  })),
);

/** Открытые маршруты: каждый — решение, записанное в docs/audit/SECURITY_MATRIX.md. */
const PUBLIC = new Set([
  'get /health',
  'get /health/ready',
  'post /v1/auth/login',
  'post /v1/auth/register',
  'post /v1/auth/password-reset',
  'get /v1/auth/oauth/providers',
  'post /v1/auth/oauth/{provider}/authorize',
  'post /v1/auth/oauth/{provider}/callback',
  'post /v1/auth/oauth/complete',
  'get /v1/jobs',
  'get /v1/jobs/{id}',
  'get /v1/contractors/{publicId}',
  'post /v1/leads',
]);

const secured = operations.filter((o) => o.secured);
const admin = operations.filter((o) => o.path.startsWith('/v1/admin/'));

const prisma = new PrismaClient();

describe('Route matrix from openapi.json (e2e)', () => {
  let app: NestExpressApplication;
  const call = (method: string, url: string) =>
    (request(app.getHttpServer()) as unknown as Record<string, (p: string) => request.Test>)[
      method
    ](url);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    process.env.RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  afterAll(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
    delete process.env.RATE_LIMIT_PER_MIN;
  });

  it('the spec lists the routes (sanity)', () => {
    expect(operations.length).toBeGreaterThan(80);
    expect(secured.length).toBeGreaterThan(60);
    expect(admin.length).toBeGreaterThan(10);
  });

  it('every open route is a recorded decision; every admin route requires a session', () => {
    const open = operations.filter((o) => !o.secured).map((o) => `${o.method} ${o.path}`);
    expect(open.sort()).toEqual([...PUBLIC].sort());
    expect(admin.filter((o) => !o.secured)).toEqual([]);
  });

  it.each(secured.map((o) => [o.method.toUpperCase(), o.url, o.method] as const))(
    'no session: %s %s → 401',
    async (_m, url, method) => {
      const res = await call(method, url).send({});
      expect(res.status).toBe(401);
      expect(res.body.code).toBeDefined();
    },
  );

  describe('admin routes refuse customers and contractors (403)', () => {
    let customer: Record<string, string>;
    let contractor: Record<string, string>;
    let adminAuth: Record<string, string>;

    beforeAll(async () => {
      customer = (await signUp(app, 'CUSTOMER')).auth;
      contractor = (await signUp(app, 'CONTRACTOR')).auth;
      adminAuth = (await signUpAdmin(app, prisma)).auth;
    });

    it.each(admin.map((o) => [o.method.toUpperCase(), o.url, o.method] as const))(
      '%s %s',
      async (_m, url, method) => {
        for (const auth of [customer, contractor]) {
          const res = await call(method, url).set(auth).send({});
          expect(res.status).toBe(403);
        }
        // Администратор проходит guard: дальше — проверка данных или «не найдено», но не 401/403.
        const res = await call(method, url).set(adminAuth).send({});
        expect([401, 403]).not.toContain(res.status);
      },
    );
  });
});
