import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { signUp } from './helpers';

const prisma = new PrismaClient();

describe('Write rate limit (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.WRITE_RATE_LIMIT_PER_MIN = '2';
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
    await prisma.$disconnect();
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
  });

  it('throttles job writes separately from reads', async () => {
    const customer = await signUp(app, 'CUSTOMER');
    const job = {
      title: 'Покраска стен',
      description: 'Покраска стен в двух комнатах, около 60 м².',
      category: 'FINISHING',
      city: 'Пермь',
    };
    const post = () =>
      request(app.getHttpServer()).post('/v1/me/jobs').set(customer.auth).send(job);
    await post().expect(201);
    await post().expect(201);
    await post().expect(429);
    await request(app.getHttpServer()).get('/v1/me/jobs').set(customer.auth).expect(200);
  });
});
