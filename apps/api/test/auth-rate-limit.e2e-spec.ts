import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';

const prisma = new PrismaClient();

describe('Auth rate limit (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '3';
    await prisma.auditLog.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany({ where: { ownerId: { not: null } } });
    await prisma.user.deleteMany();
    await prisma.loginFailure.deleteMany();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
  });

  it('blocks repeated login attempts with 429 but leaves other routes alone', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'victim@example.ru', password: 'guess-password-1' });

    for (let i = 0; i < 3; i += 1) {
      await attempt().expect(401);
    }
    // Именно лимит по IP (а не пауза после серии неверных паролей к адресу — та после пяти).
    const limited = await attempt().expect(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    await request(app.getHttpServer()).get('/v1/jobs').expect(200);
  });
});
