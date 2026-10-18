import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { createTestApp } from './create-app';
import { signUp } from './helpers';

const prisma = new PrismaClient();
const PASSWORD = 'correct-horse-battery';
const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

async function cleanDb(): Promise<void> {
  await prisma.lead.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.job.deleteMany({ where: { ownerId: { not: null } } });
  await prisma.user.deleteMany();
}

describe('Account (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    await cleanDb();
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
    await cleanDb();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  /** Регистрация с паролем, который знаем, и браузером для подписи устройства. */
  async function register(email = `acc-${Date.now()}-${Math.random()}@example.ru`) {
    const res = await http()
      .post('/v1/auth/register')
      .set('X-Client-User-Agent', CHROME_WIN)
      .send({ email, password: PASSWORD, name: 'Ирина', role: 'CUSTOMER' })
      .expect(201);
    return {
      email,
      id: res.body.user.id as string,
      auth: { Authorization: `Bearer ${res.body.token}` },
    };
  }

  const login = (email: string, password = PASSWORD) =>
    http().post('/v1/auth/login').send({ email, password });

  describe('profile', () => {
    it('updates name, normalizes the phone and clears fields with null or ""', async () => {
      const user = await register();
      const res = await http()
        .patch('/v1/me')
        .set(user.auth)
        .send({ name: '  Ирина П. ', phone: '8 (912) 345-67-89', city: ' Тверь ' })
        .expect(200);
      expect(res.body).toMatchObject({ name: 'Ирина П.', phone: '+79123456789', city: 'Тверь' });

      const cleared = await http()
        .patch('/v1/me')
        .set(user.auth)
        .send({ phone: '', city: null })
        .expect(200);
      expect(cleared.body).toMatchObject({ name: 'Ирина П.', phone: null, city: null });
    });

    it.each([
      [{ phone: '12345' }, 'российский номер'],
      [{ name: 'И' }, 'Имя должно содержать'],
      [{ city: 'Тверь‮' }, 'недопустимые символы'],
      [{ role: 'ADMIN' }, 'should not exist'],
      [{ email: 'other@example.ru' }, 'should not exist'],
    ] as [object, string][])('rejects %j', async (body, message) => {
      const user = await register();
      const res = await http().patch('/v1/me').set(user.auth).send(body).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(message);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.role).toBe('CUSTOMER');
    });

    it('requires a session', async () => {
      await http().patch('/v1/me').send({ name: 'Кто-то' }).expect(401);
    });
  });

  describe('preferences', () => {
    it('saves theme, scale and motion; rejects unknown values', async () => {
      const user = await register();
      const res = await http()
        .patch('/v1/me/preferences')
        .set(user.auth)
        .send({ theme: 'dark', scale: 'large' })
        .expect(200);
      expect(res.body.preferences).toEqual({ theme: 'dark', scale: 'large', motion: 'system' });
      await http().patch('/v1/me/preferences').set(user.auth).send({ theme: 'pink' }).expect(400);
      const me = await http().get('/v1/me').set(user.auth).expect(200);
      expect(me.body.preferences.theme).toBe('dark');
    });
  });

  describe('password', () => {
    it('changes the password, keeps this session and ends the others', async () => {
      const user = await register();
      const other = await login(user.email).expect(200);
      const otherAuth = { Authorization: `Bearer ${other.body.token}` };

      await http()
        .post('/v1/me/password')
        .set(user.auth)
        .send({ currentPassword: PASSWORD, newPassword: 'new-password-2026' })
        .expect(204);

      await http().get('/v1/me').set(user.auth).expect(200);
      await http().get('/v1/me').set(otherAuth).expect(401);
      await login(user.email).expect(401);
      await login(user.email, 'new-password-2026').expect(200);

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: user.id, action: 'PASSWORD_CHANGED' },
      });
      expect(audit.changes).toEqual({ otherSessions: { from: 1, to: 0 } });
      expect(JSON.stringify(audit.changes)).not.toContain('new-password');
    });

    it.each([
      [{ currentPassword: 'wrong-password-1', newPassword: 'new-password-2026' }, 'неверно'],
      [{ currentPassword: PASSWORD, newPassword: PASSWORD }, 'отличаться'],
      [{ currentPassword: PASSWORD, newPassword: 'short' }, 'от 10 до 128'],
    ] as [object, string][])('rejects %j without changing anything', async (body, message) => {
      const user = await register();
      const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const res = await http().post('/v1/me/password').set(user.auth).send(body).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(message);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.passwordHash).toBe(before.passwordHash);
    });

    it('rejects a new password equal to the email', async () => {
      const email = `pw-${Date.now()}@example.ru`;
      const user = await register(email);
      await http()
        .post('/v1/me/password')
        .set(user.auth)
        .send({ currentPassword: PASSWORD, newPassword: email })
        .expect(400);
    });
  });

  describe('sessions', () => {
    it('lists own sessions with device labels and marks the current one', async () => {
      const user = await register();
      await login(user.email).expect(200);
      const res = await http().get('/v1/me/sessions').set(user.auth).expect(200);
      expect(res.body).toHaveLength(2);
      const current = res.body.find((s: { current: boolean }) => s.current);
      expect(current.device).toBe('Chrome, Windows');
      expect(res.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
      expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    });

    it('revokes one other session, not the current one and not someone else’s', async () => {
      const user = await register();
      const other = await login(user.email).expect(200);
      const stranger = await signUp(app, 'CONTRACTOR');
      const list = await http().get('/v1/me/sessions').set(user.auth).expect(200);
      const currentId = list.body.find((s: { current: boolean }) => s.current).id;
      const otherId = list.body.find((s: { current: boolean }) => !s.current).id;

      await http().delete(`/v1/me/sessions/${currentId}`).set(user.auth).expect(400);
      // Чужой пользователь не может завершить мой сеанс, даже зная его id.
      await http().delete(`/v1/me/sessions/${otherId}`).set(stranger.auth).expect(404);
      await http()
        .get('/v1/me')
        .set({ Authorization: `Bearer ${other.body.token}` })
        .expect(200);

      await http().delete(`/v1/me/sessions/${otherId}`).set(user.auth).expect(204);
      await http()
        .get('/v1/me')
        .set({ Authorization: `Bearer ${other.body.token}` })
        .expect(401);
      await http().delete(`/v1/me/sessions/${otherId}`).set(user.auth).expect(404);
    });

    it('revokes all other sessions', async () => {
      const user = await register();
      await login(user.email).expect(200);
      await login(user.email).expect(200);
      const res = await http().post('/v1/me/sessions/revoke-others').set(user.auth).expect(200);
      expect(res.body).toEqual({ revoked: 2 });
      const list = await http().get('/v1/me/sessions').set(user.auth).expect(200);
      expect(list.body).toHaveLength(1);
    });
  });

  describe('avatar', () => {
    const photo = (format: 'jpeg' | 'png', width = 1200, height = 800) =>
      sharp({ create: { width, height, channels: 3, background: '#c2410c' } })
        [format]()
        .withExif({ IFD0: { Copyright: 'secret-gps-location' } })
        .toBuffer();

    it('re-encodes to a 512×512 WebP without metadata and serves it only to the owner', async () => {
      const user = await register();
      const res = await http()
        .put('/v1/me/avatar')
        .set(user.auth)
        .attach('file', await photo('jpeg'), { filename: 'me.jpg', contentType: 'image/jpeg' })
        .expect(200);
      expect(res.body.avatarVersion).toEqual(expect.any(String));

      const image = await http()
        .get('/v1/me/avatar')
        .set(user.auth)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200)
        .expect('Content-Type', /image\/webp/);
      const meta = await sharp(image.body as Buffer).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 512, height: 512 });
      expect(meta.exif).toBeUndefined();
      expect((image.body as Buffer).includes(Buffer.from('secret-gps-location'))).toBe(false);

      await http().get('/v1/me/avatar').expect(401);
      const stranger = await signUp(app, 'CUSTOMER');
      await http().get('/v1/me/avatar').set(stranger.auth).expect(404);
    });

    it.each([
      ['a text file renamed to .png', Buffer.from('<?php echo 1; ?>'), 'image/png', 400],
      ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml', 400],
    ])('rejects %s', async (_name, data, contentType, status) => {
      const user = await register();
      await http()
        .put('/v1/me/avatar')
        .set(user.auth)
        .attach('file', data, { filename: 'x.png', contentType })
        .expect(status);
      const stored = await prisma.userAvatar.findUnique({ where: { userId: user.id } });
      expect(stored).toBeNull();
    });

    it('rejects a missing file and files over 5 MB', async () => {
      const user = await register();
      await http().put('/v1/me/avatar').set(user.auth).field('x', '1').expect(400);
      const big = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
      await http()
        .put('/v1/me/avatar')
        .set(user.auth)
        .attach('file', big, { filename: 'big.jpg', contentType: 'image/jpeg' })
        .expect(413);
    });

    it('deletes the photo', async () => {
      const user = await register();
      await http()
        .put('/v1/me/avatar')
        .set(user.auth)
        .attach('file', await photo('png', 300, 300), {
          filename: 'me.png',
          contentType: 'image/png',
        })
        .expect(200);
      const res = await http().delete('/v1/me/avatar').set(user.auth).expect(200);
      expect(res.body.avatarVersion).toBeNull();
      await http().get('/v1/me/avatar').set(user.auth).expect(404);
    });
  });
});
