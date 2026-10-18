import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { JobCategory, JobStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

const prisma = new PrismaClient();
const BASE_TIME = new Date('2026-01-15T12:00:00.000Z').getTime();
const categories: JobCategory[] = ['PLUMBING', 'ELECTRICAL', 'TILING'];

// 30 заказов: createdAt убывает с ростом индекса, категории чередуются. Заказы 3, 13, 23 в
// Санкт-Петербурге; в описании заказа 4 есть «%» и «_» (проверка экранирования поиска).
const fixtures = Array.from({ length: 30 }, (_, i) => ({
  id: `test-job-${String(i).padStart(2, '0')}`,
  title: `Тестовый заказ ${i}`,
  description:
    i === 4
      ? 'Описание тестового заказа 4: Плитка, скидка 50% на шов_2мм'
      : `Описание тестового заказа ${i}`,
  category: categories[i % categories.length],
  city: i % 10 === 3 ? 'Санкт-Петербург' : 'Москва',
  budgetMin: i % 5 === 0 ? null : 1000 * i,
  budgetMax: i % 5 === 0 ? null : 2000 * i,
  status: (i % 7 === 0 ? 'CLOSED' : 'OPEN') as JobStatus,
  createdAt: new Date(BASE_TIME - i * 60_000),
}));

describe('API (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany();
    await prisma.job.createMany({ data: fixtures });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app, { corsOrigins: ['http://localhost:3000'], trustProxy: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany();
    await prisma.$disconnect();
  });

  describe('GET /health', () => {
    it('returns {status:"ok"}', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('sets security headers', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('GET /v1/jobs', () => {
    it('returns first page with defaults (page=1, limit=12)', async () => {
      const res = await request(app.getHttpServer()).get('/v1/jobs').expect(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(12);
      expect(res.body.total).toBe(30);
      expect(res.body.items).toHaveLength(12);
      expect(res.body.items[0].id).toBe('test-job-00');
    });

    it('returns the public job shape only', async () => {
      const res = await request(app.getHttpServer()).get('/v1/jobs?limit=1').expect(200);
      expect(res.body.items[0]).toEqual({
        id: 'test-job-00',
        title: 'Тестовый заказ 0',
        description: 'Описание тестового заказа 0',
        category: 'PLUMBING',
        city: 'Москва',
        budgetMin: null,
        budgetMax: null,
        currency: 'RUB',
        status: 'CLOSED',
        details: {},
        extraItems: [],
        createdAt: new Date(BASE_TIME).toISOString(),
      });
    });

    it('orders by createdAt desc and paginates without overlap', async () => {
      const server = app.getHttpServer();
      const p1 = await request(server).get('/v1/jobs?page=1&limit=10').expect(200);
      const p3 = await request(server).get('/v1/jobs?page=3&limit=10').expect(200);
      const ids = [...p1.body.items, ...p3.body.items].map((j: { id: string }) => j.id);
      expect(ids).toEqual(fixtures.filter((_, i) => i < 10 || i >= 20).map((f) => f.id));
      expect(p3.body).toMatchObject({ page: 3, limit: 10, total: 30 });
    });

    it('returns empty items past the last page', async () => {
      const res = await request(app.getHttpServer()).get('/v1/jobs?page=99&limit=12').expect(200);
      expect(res.body).toEqual({ items: [], page: 99, limit: 12, total: 30 });
    });

    it('filters by category', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/jobs?category=ELECTRICAL&limit=50')
        .expect(200);
      expect(res.body.total).toBe(10);
      expect(res.body.items.every((j: { category: string }) => j.category === 'ELECTRICAL')).toBe(
        true,
      );
    });

    it('filters by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/jobs?status=OPEN&limit=50')
        .expect(200);
      expect(res.body.total).toBe(25);
      expect(res.body.items.every((j: { status: string }) => j.status === 'OPEN')).toBe(true);
    });

    it('filters by city case-insensitively', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/jobs?city=${encodeURIComponent('  санкт-петербург ')}&limit=50`)
        .expect(200);
      expect(res.body.items.map((j: { id: string }) => j.id)).toEqual([
        'test-job-03',
        'test-job-13',
        'test-job-23',
      ]);
    });

    it('searches title and description case-insensitively', async () => {
      const server = app.getHttpServer();
      const byDescription = await request(server)
        .get(`/v1/jobs?q=${encodeURIComponent('  ПЛИТКА ')}`)
        .expect(200);
      expect(byDescription.body.items.map((j: { id: string }) => j.id)).toEqual(['test-job-04']);
      const byTitle = await request(server)
        .get(`/v1/jobs?q=${encodeURIComponent('заказ 2')}&limit=50`)
        .expect(200);
      expect(byTitle.body.total).toBe(11); // 2, 20-29
    });

    // Без экранирования «0%» и «_2» совпали бы со многими заказами (любая «0» / символ перед «2»).
    it.each([
      ['q', '0%'],
      ['q', '_2'],
      ['city', '%%'],
      ['city', 'М_сква'],
    ])('treats LIKE wildcards in %s=%s literally', async (name, value) => {
      const res = await request(app.getHttpServer())
        .get(`/v1/jobs?${name}=${encodeURIComponent(value)}&limit=50`)
        .expect(200);
      const expected = name === 'q' ? ['test-job-04'] : [];
      expect(res.body.items.map((j: { id: string }) => j.id)).toEqual(expected);
    });

    it('combines filters', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/v1/jobs?category=TILING&status=OPEN&city=${encodeURIComponent('Москва')}&q=${encodeURIComponent('заказ')}&limit=50`,
        )
        .expect(200);
      const ids = fixtures
        .map((f, i) => ({ f, i }))
        .filter(({ f, i }) => f.category === 'TILING' && i % 7 !== 0 && i % 10 !== 3)
        .map(({ f }) => f.id);
      expect(res.body.items.map((j: { id: string }) => j.id)).toEqual(ids);
    });

    it.each([
      ['limit=51', 'limit above maximum'],
      ['limit=0', 'zero limit'],
      ['limit=-1', 'negative limit'],
      ['limit=1.5', 'fractional limit'],
      ['page=0', 'zero page'],
      ['page=abc', 'non-numeric page'],
      ['page=', 'empty page'],
      ['page=1&page=2', 'repeated page'],
      ['page=10001', 'page above maximum'],
      ['category=UNKNOWN', 'unknown category'],
      ['status=DRAFT', 'unknown status'],
      ['q=', 'empty search'],
      ['q=%20%20', 'blank search'],
      ['q=a', 'search too short'],
      [`q=${'а'.repeat(101)}`, 'search too long'],
      ['q=ab&q=cd', 'repeated search'],
      ['city=%20', 'blank city'],
      [`city=${'а'.repeat(101)}`, 'city too long'],
      ['sort=title', 'unknown parameter'],
    ])('rejects %s (%s) with 400', async (qs) => {
      const res = await request(app.getHttpServer()).get(`/v1/jobs?${qs}`).expect(400);
      expect(res.body.statusCode).toBe(400);
    });
  });

  describe('GET /v1/jobs/:id', () => {
    it('returns a job by id', async () => {
      const res = await request(app.getHttpServer()).get('/v1/jobs/test-job-03').expect(200);
      expect(res.body).toMatchObject({ id: 'test-job-03', title: 'Тестовый заказ 3' });
      expect(res.body).not.toHaveProperty('updatedAt');
    });

    it.each(['does-not-exist', 'x'.repeat(65), "1' OR '1'='1", '%00'])(
      'returns 404 for %s',
      async (id) => {
        const res = await request(app.getHttpServer())
          .get(`/v1/jobs/${encodeURIComponent(id)}`)
          .expect(404);
        expect(res.body).toMatchObject({ statusCode: 404, message: 'Заказ не найден' });
      },
    );
  });

  describe('trust proxy', () => {
    it('ignores X-Forwarded-For by default so clients cannot spoof their IP', () => {
      expect(app.getHttpAdapter().getInstance().get('trust proxy')).toBe(false);
    });
  });

  describe('CORS', () => {
    it('allows configured origin and omits header for others', async () => {
      const server = app.getHttpServer();
      const ok = await request(server).get('/health').set('Origin', 'http://localhost:3000');
      expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      const denied = await request(server).get('/health').set('Origin', 'https://evil.example');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
