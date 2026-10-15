import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { generateSessionToken, hashSessionToken, SESSION_TTL_MS } from '../src/auth/session-token';
import { createTestApp } from './create-app';
import { signUp } from './helpers';

const prisma = new PrismaClient();

type Snapshot = {
  about: string;
  categories: string[];
  cities: string[];
  experienceYears: number | null;
} | null;

const profileFor = (i: number) => ({
  about: `Версия профиля ${i}`,
  categories: ['TILING'],
  cities: [`Город ${i}`],
  experienceYears: i,
});

describe('Contractor profile concurrency and access (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
  });

  it('parallel PUTs (including the first one) form a continuous audit chain', async () => {
    const contractor = await signUp(app, 'CONTRACTOR');
    const versions = Array.from({ length: 8 }, (_, i) => profileFor(i + 1));
    const results = await Promise.all(
      versions.map((p) => http().put('/v1/me/profile').set(contractor.auth).send(p)),
    );
    expect(results.map((r) => r.status)).toEqual(versions.map(() => 200));

    const stored = await prisma.contractorProfile.findUniqueOrThrow({
      where: { userId: contractor.id },
    });
    const audit = await prisma.auditLog.findMany({
      where: { actorId: contractor.id, action: 'PROFILE_UPDATED' },
    });
    expect(audit).toHaveLength(versions.length);

    // Цепочка: ровно одна запись с from = null (первое создание), далее каждое «было» равно
    // предыдущему «стало», последнее «стало» совпадает с профилем в БД.
    const changes = audit.map(
      (a) => (a.changes as { profile: { from: Snapshot; to: Snapshot } }).profile,
    );
    let current: Snapshot = null;
    const remaining = [...changes];
    while (remaining.length > 0) {
      const index = remaining.findIndex((c) => JSON.stringify(c.from) === JSON.stringify(current));
      expect(index).toBeGreaterThanOrEqual(0);
      current = remaining[index].to;
      remaining.splice(index, 1);
    }
    expect(current).toEqual({
      about: stored.about,
      categories: stored.categories,
      cities: stored.cities,
      experienceYears: stored.experienceYears,
    });
  });

  it('is not available to customers or administrators', async () => {
    const customer = await signUp(app, 'CUSTOMER');
    const admin = await prisma.user.create({
      data: {
        email: `admin-${Date.now()}@example.ru`,
        passwordHash: 'x',
        name: 'Администратор',
        role: 'ADMIN',
      },
    });
    const token = generateSessionToken();
    await prisma.session.create({
      data: {
        userId: admin.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    for (const auth of [customer.auth, { Authorization: `Bearer ${token}` }]) {
      await http().get('/v1/me/profile').set(auth).expect(403);
      await http().put('/v1/me/profile').set(auth).send(profileFor(1)).expect(403);
    }
    expect(await prisma.contractorProfile.count()).toBe(0);
  });
});
