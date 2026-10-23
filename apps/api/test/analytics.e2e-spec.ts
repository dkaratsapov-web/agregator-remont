import { ANALYTICS_METRICS, type AnalyticsDto } from '@agregator/shared';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { mskDay, UsageCounters } from '../src/analytics/usage';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp, signUpAdmin } from './helpers';

const prisma = new PrismaClient();
const jobBody = {
  title: 'Покраска стен в спальне',
  description: 'Две стены, шпаклёвка уже есть, нужна покраска в два слоя.',
  category: 'OTHER',
  details: requiredAnswers('OTHER'),
  city: 'Москва',
};
const bidBody = { price: 25_000, durationDays: 3, comment: 'Покрашу за три дня, материалы ваши.' };

describe('Analytics without personal data (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  const clean = async () => {
    await prisma.usageCounter.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.jobMessage.deleteMany();
    await prisma.review.deleteMany();
    await prisma.jobPlan.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.jobDraft.deleteMany();
    await prisma.job.deleteMany({ where: { ownerId: { not: null } } });
    await prisma.user.deleteMany();
  };
  beforeEach(clean);

  afterAll(async () => {
    await clean();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
  });

  const totals = (report: AnalyticsDto) =>
    Object.fromEntries(report.series.map((s) => [s.metric, s.total]));

  it('counts each funnel step for today and returns only numbers', async () => {
    const admin = await signUpAdmin(app, prisma);
    const customer = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');

    // Каталог: первая страница считается, листание — нет; карточка заказа — каждый просмотр.
    await http().get('/v1/jobs').expect(200);
    await http().get('/v1/jobs?page=2').expect(200);
    await http().post('/v1/me/drafts').set(customer.auth).send({ title: 'Черновик' }).expect(201);
    const { body: job } = await http()
      .post('/v1/me/jobs')
      .set(customer.auth)
      .send(jobBody)
      .expect(201);
    await http().get(`/v1/jobs/${job.id}`).expect(200);
    await http().get('/v1/jobs/no-such-job').expect(404);
    const { body: bid } = await http()
      .post(`/v1/jobs/${job.id}/bids`)
      .set(contractor.auth)
      .send(bidBody)
      .expect(201);
    await http().post(`/v1/me/jobs/${job.id}/bids/${bid.id}/accept`).set(customer.auth).expect(200);
    await http()
      .post(`/v1/jobs/${job.id}/messages`)
      .set(customer.auth)
      .send({ body: 'Когда удобно начать?' })
      .expect(200);
    await http().put(`/v1/jobs/${job.id}/contacts`).set(contractor.auth).expect(200);
    await http()
      .post(`/v1/me/jobs/${job.id}/close`)
      .set(customer.auth)
      .send({ outcome: 'COMPLETED' })
      .expect(200);
    await http()
      .post(`/v1/me/jobs/${job.id}/review`)
      .set(customer.auth)
      .send({ rating: 5, text: 'Аккуратно и в срок.' })
      .expect(201);
    // Отменённый заказ в «выполненные» не попадает.
    const { body: other } = await http()
      .post('/v1/me/jobs')
      .set(customer.auth)
      .send({ ...jobBody, title: 'Отменённый заказ' })
      .expect(201);
    await http()
      .post(`/v1/me/jobs/${other.id}/close`)
      .set(customer.auth)
      .send({ outcome: 'CANCELLED' })
      .expect(200);

    const res = await http().get('/v1/admin/analytics?days=7').set(admin.auth).expect(200);
    const report = res.body as AnalyticsDto;
    expect(report.days).toHaveLength(7);
    expect(report.days.at(-1)).toBe(mskDay(new Date()));
    expect(report.series.map((s) => s.metric)).toEqual([...ANALYTICS_METRICS]);
    expect(totals(report)).toEqual({
      CUSTOMERS_REGISTERED: 1,
      CONTRACTORS_REGISTERED: 1,
      CATALOG_VIEWS: 1,
      JOB_VIEWS: 1,
      DRAFTS_STARTED: 1,
      JOBS_PUBLISHED: 2,
      BIDS_PLACED: 1,
      CONTRACTORS_CHOSEN: 1,
      MESSAGES_SENT: 1,
      JOBS_COMPLETED: 1,
      REVIEWS_LEFT: 1,
      CONTACTS_SHARED: 1,
    });
    for (const series of report.series) {
      expect(series.perDay.slice(0, -1).every((n) => n === 0)).toBe(true);
      expect(series.perDay.at(-1)).toBe(series.total);
    }

    // Ни email, ни имён, ни id людей и заказов в ответе нет.
    const text = JSON.stringify(report);
    const people = await prisma.user.findMany({ select: { id: true, email: true, name: true } });
    for (const person of people) {
      expect(text).not.toContain(person.email);
      expect(text).not.toContain(person.id);
      expect(text).not.toContain(person.name);
    }
    expect(text).not.toContain(job.id);
    expect(await prisma.usageCounter.count()).toBe(3);
  });

  it('public views are buffered in memory and saved in one write, failures are kept', async () => {
    const usage = app.get(UsageCounters);
    await usage.flush();
    for (let i = 0; i < 5; i += 1) await http().get('/v1/jobs').expect(200);
    // Открытие каталога не пишет в базу на каждый запрос.
    expect(await prisma.usageCounter.count()).toBe(0);
    await usage.flush();
    const saved = await prisma.usageCounter.findMany();
    expect(saved).toEqual([expect.objectContaining({ metric: 'CATALOG_VIEWS', count: 5 })]);

    // Сбой записи: накопленное возвращается в очередь и уходит при следующем сбросе.
    usage.add('CATALOG_VIEWS');
    const write = jest
      .spyOn(app.get(PrismaService), '$executeRaw')
      .mockRejectedValueOnce(new Error('connection lost'));
    await usage.flush();
    write.mockRestore();
    expect((await prisma.usageCounter.findFirstOrThrow()).count).toBe(5);
    await usage.flush();
    expect((await prisma.usageCounter.findFirstOrThrow()).count).toBe(6);

    // Последний сброс при остановке не удался: потеря видна в журнале, а не тихая.
    usage.add('CATALOG_VIEWS');
    usage.add('JOB_VIEWS');
    const lostWrite = jest
      .spyOn(app.get(PrismaService), '$executeRaw')
      .mockRejectedValueOnce(new Error('connection lost'));
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await usage.onModuleDestroy();
    lostWrite.mockRestore();
    expect(logged).toHaveBeenCalledWith('counters lost at shutdown: 2');
    logged.mockRestore();
    usage.onModuleInit();
  });

  it('only an admin sees it; the period is 7, 30 or 90 days', async () => {
    const admin = await signUpAdmin(app, prisma);
    const customer = await signUp(app, 'CUSTOMER');
    await http().get('/v1/admin/analytics').expect(401);
    await http().get('/v1/admin/analytics').set(customer.auth).expect(403);
    const month = await http().get('/v1/admin/analytics').set(admin.auth).expect(200);
    expect(month.body.days).toHaveLength(30);
    const quarter = await http().get('/v1/admin/analytics?days=90').set(admin.auth).expect(200);
    expect(quarter.body.days).toHaveLength(90);
    await http().get('/v1/admin/analytics?days=365').set(admin.auth).expect(400);
    await http().get('/v1/admin/analytics?days=abc').set(admin.auth).expect(400);
  });

  it('days follow Moscow time and older counters stay outside the period', async () => {
    // 21:30 UTC — уже следующий день по Москве.
    expect(mskDay(new Date('2026-10-21T21:30:00Z'))).toBe('2026-10-22');
    expect(mskDay(new Date('2026-10-21T20:59:59Z'))).toBe('2026-10-21');
    const now = new Date('2026-10-22T09:00:00Z');
    await prisma.usageCounter.createMany({
      data: [
        { day: new Date('2026-10-22T00:00:00Z'), metric: 'CATALOG_VIEWS', count: 4 },
        { day: new Date('2026-10-16T00:00:00Z'), metric: 'CATALOG_VIEWS', count: 2 },
        { day: new Date('2026-10-15T00:00:00Z'), metric: 'CATALOG_VIEWS', count: 100 },
      ],
    });
    // Заказ, созданный в 22:00 UTC 21-го, — это 22-е по Москве.
    const owner = await signUp(app, 'CUSTOMER');
    await prisma.auditLog.create({
      data: {
        actorId: owner.id,
        action: 'JOB_CREATED',
        entityType: 'job',
        entityId: 'late-evening',
        changes: {},
        createdAt: new Date('2026-10-21T22:00:00Z'),
      },
    });
    const report = await app.get(AnalyticsService).report(7, now);
    expect(report.days).toEqual([
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
    ]);
    const catalog = report.series.find((s) => s.metric === 'CATALOG_VIEWS')!;
    expect(catalog.perDay).toEqual([2, 0, 0, 0, 0, 0, 4]);
    const published = report.series.find((s) => s.metric === 'JOBS_PUBLISHED')!;
    expect(published.perDay.at(-1)).toBe(1);
  });
});
