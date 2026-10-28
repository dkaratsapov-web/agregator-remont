import type { JobDto, Paginated } from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { CATALOG_COUNT_CACHE } from '../src/jobs/jobs.service';
import { createTestApp } from './create-app';
import { signUp } from './helpers';

/**
 * Число «всего» в каталоге (src/jobs/count-cache.ts): небольшое — точное сразу, большое —
 * хранится несколько секунд и не пересчитывается на каждый запрос.
 */
const prisma = new PrismaClient();

describe('Catalog total count (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const tag = `Счёт${Date.now().toString(36)}`;
  let ownerId: string;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  const clean = async () => {
    await prisma.auditLog.deleteMany();
    await prisma.job.deleteMany({ where: { ownerId: { not: null } } });
    await prisma.user.deleteMany();
  };
  beforeEach(async () => {
    await clean();
    ownerId = (await signUp(app, 'CUSTOMER')).id;
  });

  afterAll(async () => {
    await clean();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
  });

  const seed = (count: number, name: string) =>
    prisma.job.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        title: `${tag} ${name} ${i}`,
        description: 'Описание заказа для проверки числа в каталоге.',
        category: 'OTHER' as const,
        city: 'Москва',
        ownerId,
      })),
    });
  const total = async (query: string) =>
    ((await http().get(`/v1/jobs?${query}`).expect(200)).body as Paginated<JobDto>).total;

  it('a small catalog is counted exactly: a new job is in the total at once', async () => {
    await seed(3, 'мало');
    const q = `q=${encodeURIComponent(tag)}`;
    expect(await total(q)).toBe(3);
    await seed(1, 'ещё');
    expect(await total(q)).toBe(4);
  });

  it('a big total is kept for a few seconds; other filters are counted on their own', async () => {
    const big = CATALOG_COUNT_CACHE.min;
    await seed(big, 'много');
    const q = `q=${encodeURIComponent(tag)}`;
    expect(await total(q)).toBe(big);
    await seed(1, 'новый');
    // Страница уже с новым заказом, число — из кэша.
    const res = (await http().get(`/v1/jobs?${q}&limit=1`).expect(200)).body as Paginated<JobDto>;
    expect(res.items[0].title).toBe(`${tag} новый 0`);
    expect(res.total).toBe(big);
    // Другие фильтры, регистр поиска не важен: тот же ключ.
    expect(await total(`q=${encodeURIComponent(tag.toUpperCase())}`)).toBe(big);
    expect(await total(`q=${encodeURIComponent(`${tag} новый`)}`)).toBe(1);
    expect(await total(`q=${encodeURIComponent(tag)}&city=Казань`)).toBe(0);
  });
});
