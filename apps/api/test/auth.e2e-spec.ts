import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { hashSessionToken } from '../src/auth/session-token';
import { createTestApp } from './create-app';

const prisma = new PrismaClient();
const PASSWORD = 'correct-horse-battery';

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  const register = (overrides: Record<string, unknown> = {}) =>
    http()
      .post('/v1/auth/register')
      .send({
        email: 'ivan@example.ru',
        password: PASSWORD,
        name: 'Иван Петров',
        role: 'CUSTOMER',
        ...overrides,
      });

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    await prisma.auditLog.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany({ where: { ownerId: { not: null } } });
    await prisma.user.deleteMany();
    app = await createTestApp();
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany({ where: { ownerId: { not: null } } });
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
  });

  describe('POST /v1/auth/register', () => {
    it('creates a user with a session and returns no secrets', async () => {
      const res = await register({ email: '  Ivan@Example.RU ' }).expect(201);
      expect(res.body.user).toEqual({
        id: expect.any(String),
        publicId: expect.any(Number),
        email: 'ivan@example.ru',
        name: 'Иван Петров',
        role: 'CUSTOMER',
        phone: null,
        city: null,
        avatarVersion: null,
        preferences: { theme: 'light', scale: 'normal', motion: 'system' },
        createdAt: expect.any(String),
      });
      expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    });

    it('stores an argon2id hash and only a SHA-256 of the session token', async () => {
      const res = await register().expect(201);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ivan@example.ru' } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(PASSWORD);
      const [session] = await prisma.session.findMany({ where: { userId: user.id } });
      expect(session.tokenHash).toBe(hashSessionToken(res.body.token));
      expect(session.tokenHash).not.toBe(res.body.token);
    });

    it('rejects a duplicate email regardless of case', async () => {
      await register().expect(201);
      const res = await register({ email: 'IVAN@example.ru' }).expect(409);
      expect(res.body.message).toBe('Пользователь с таким email уже зарегистрирован');
    });

    it.each<[Record<string, unknown>, string]>([
      [{ role: 'ADMIN' }, 'ADMIN role'],
      [{ role: 'customer' }, 'unknown role'],
      [{ role: undefined }, 'missing role'],
      [{ email: 'not-an-email' }, 'invalid email'],
      [{ password: 'short' }, 'short password'],
      [{ password: 'x'.repeat(129) }, 'overlong password'],
      [{ name: 'А' }, 'short name'],
      [{ name: 'Иван‮Петров' }, 'bidi override in name'],
      [{ name: 'Иван\nПетров' }, 'newline in name'],
      [{ isAdmin: true }, 'unknown field'],
    ])('rejects %j (%s) with 400', async (overrides, _reason) => {
      await register(overrides).expect(400);
      expect(await prisma.user.count()).toBe(0);
    });

    it('rejects a password equal to the email', async () => {
      await register({
        email: 'longaddress@example.ru',
        password: 'longaddress@example.ru',
      }).expect(409);
    });
  });

  describe('POST /v1/auth/login', () => {
    it('logs in with normalized email and creates a new session', async () => {
      await register().expect(201);
      const res = await http()
        .post('/v1/auth/login')
        .send({ email: ' IVAN@example.ru', password: PASSWORD })
        .expect(200);
      expect(res.body.user.email).toBe('ivan@example.ru');
      expect(await prisma.session.count()).toBe(2);
    });

    it('blocking during a login: 403, and no session survives the block (AUD-10)', async () => {
      const { id: userId } = (await register().expect(201)).body.user as { id: string };
      // «Администратор» блокирует аккаунт и держит транзакцию открытой, пока идёт вход.
      let commit!: () => void;
      const held = new Promise<void>((resolve) => (commit = resolve));
      const block = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
          await tx.user.update({ where: { id: userId }, data: { blockedAt: new Date() } });
          await tx.session.deleteMany({ where: { userId } });
          await held;
        },
        { timeout: 20_000 },
      );
      const login = http()
        .post('/v1/auth/login')
        .send({ email: 'ivan@example.ru', password: PASSWORD })
        .then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      commit();
      await block;
      expect((await login).status).toBe(403);
      expect(await prisma.session.count({ where: { userId } })).toBe(0);
    });

    it('returns the same generic 401 for a wrong password and an unknown email', async () => {
      await register().expect(201);
      const wrong = await http()
        .post('/v1/auth/login')
        .send({ email: 'ivan@example.ru', password: 'wrong-password-123' })
        .expect(401);
      const unknown = await http()
        .post('/v1/auth/login')
        .send({ email: 'nobody@example.ru', password: PASSWORD })
        .expect(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.body.message).toBe('Неверный email или пароль');
    });

    it('rejects malformed input with 400', async () => {
      await http().post('/v1/auth/login').send({ email: 'ivan@example.ru' }).expect(400);
      await http()
        .post('/v1/auth/login')
        .send({ email: 'ivan@example.ru', password: 'x'.repeat(129) })
        .expect(400);
    });
  });

  describe('GET /v1/me and POST /v1/auth/logout', () => {
    it('returns the current user for a valid session', async () => {
      const { body } = await register({ role: 'CONTRACTOR' }).expect(201);
      const me = await http()
        .get('/v1/me')
        .set('Authorization', `Bearer ${body.token}`)
        .expect(200);
      expect(me.body).toEqual(body.user);
    });

    it.each([
      ['no header', undefined],
      ['wrong scheme', 'Basic abc'],
      ['malformed token', 'Bearer not-a-token'],
      ['unknown token', `Bearer ${'A'.repeat(43)}`],
    ])('rejects %s with 401', async (_name, header) => {
      const req = http().get('/v1/me');
      if (header) req.set('Authorization', header);
      await req.expect(401);
    });

    it('rejects an expired session', async () => {
      const { body } = await register().expect(201);
      await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await http().get('/v1/me').set('Authorization', `Bearer ${body.token}`).expect(401);
    });

    it('invalidates only the current session on logout', async () => {
      const first = (await register().expect(201)).body.token;
      const second = (
        await http()
          .post('/v1/auth/login')
          .send({ email: 'ivan@example.ru', password: PASSWORD })
          .expect(200)
      ).body.token;

      await http().post('/v1/auth/logout').set('Authorization', `Bearer ${first}`).expect(204);
      await http().get('/v1/me').set('Authorization', `Bearer ${first}`).expect(401);
      await http().get('/v1/me').set('Authorization', `Bearer ${second}`).expect(200);
      await http().post('/v1/auth/logout').set('Authorization', `Bearer ${first}`).expect(401);
    });

    it('takes the role from the database, not from the request', async () => {
      const { body } = await register({ role: 'CUSTOMER' }).expect(201);
      const me = await http()
        .get('/v1/me?role=ADMIN')
        .set('Authorization', `Bearer ${body.token}`)
        .set('X-User-Role', 'ADMIN')
        .expect(200);
      expect(me.body.role).toBe('CUSTOMER');
    });
  });
});
