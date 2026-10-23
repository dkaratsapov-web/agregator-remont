import { PRICE_ESTIMATE, type JobCategory, type PriceEstimatesDto } from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { signUp } from './helpers';

const prisma = new PrismaClient();
const DAY_MS = 86_400_000;

describe('Price estimates from bids (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  const clean = async () => {
    await prisma.auditLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany({ where: { ownerId: { not: null } } });
    await prisma.user.deleteMany();
  };
  beforeEach(clean);

  afterAll(async () => {
    await clean();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
  });

  let ownerId: string;
  const masters: string[] = [];
  const setup = async () => {
    ownerId = (await signUp(app, 'CUSTOMER')).id;
    masters.length = 0;
    for (let i = 0; i < 4; i += 1) masters.push((await signUp(app, 'CONTRACTOR')).id);
  };
  const job = async (
    category: JobCategory,
    city = 'Москва',
    extra: { extra?: JobCategory[]; hiddenAt?: Date } = {},
  ) =>
    (
      await prisma.job.create({
        data: {
          title: 'Работа для оценки',
          description: 'Описание работы для оценки цены по откликам мастеров.',
          category,
          // categories собирает триггер базы из category и extraItems.
          extraItems: (extra.extra ?? []).map((c) => ({ category: c, details: {} })),
          city,
          ownerId,
          hiddenAt: extra.hiddenAt ?? null,
        },
      })
    ).id;
  const bid = (
    jobId: string,
    contractorId: string,
    price: number,
    extra: { status?: 'WITHDRAWN'; hiddenAt?: Date; createdAt?: Date } = {},
  ) =>
    prisma.bid.create({
      data: { jobId, contractorId, price, comment: 'Сделаю аккуратно.', ...extra },
    });
  const estimates = async (auth: { Authorization: string }, query = '') =>
    (await http().get(`/v1/price-estimates${query}`).set(auth).expect(200))
      .body as PriceEstimatesDto;

  /** 3 заказа, 3 мастера, 5 откликов: цены 10 000 … 30 000. */
  const enough = async (category: JobCategory, city = 'Москва') => {
    const [a, b, c] = [
      await job(category, city),
      await job(category, city),
      await job(category, city),
    ];
    await bid(a, masters[0], 10_000);
    await bid(a, masters[1], 15_000);
    await bid(b, masters[0], 20_000);
    await bid(b, masters[2], 25_000);
    await bid(c, masters[1], 30_000);
  };

  it('quartiles by category in the city, rounded, only numbers', async () => {
    await setup();
    await enough('TILING');
    const viewer = await signUp(app, 'CUSTOMER');
    const res = await estimates(viewer.auth, '?city=москва');
    expect(res.items).toEqual([
      { category: 'TILING', city: 'Москва', low: 15_000, median: 20_000, high: 25_000, bids: 5 },
    ]);
    // Ни id, ни имён — только числа.
    const text = JSON.stringify(res);
    for (const id of [ownerId, ...masters]) expect(text).not.toContain(id);
  });

  it('too little data: fewer bids, jobs or masters than the thresholds — no estimate', async () => {
    await setup();
    const viewer = await signUp(app, 'CUSTOMER');
    // 4 отклика.
    const [a, b, c] = [await job('PLUMBING'), await job('PLUMBING'), await job('PLUMBING')];
    await bid(a, masters[0], 5_000);
    await bid(b, masters[1], 6_000);
    await bid(c, masters[2], 7_000);
    await bid(a, masters[3], 8_000);
    // 5 откликов, но только от двух мастеров.
    const [d, e, f] = [await job('ROOFING'), await job('ROOFING'), await job('ROOFING')];
    for (const [jobId, master, price] of [
      [d, 0, 1],
      [e, 0, 2],
      [f, 0, 3],
      [d, 1, 4],
      [e, 1, 5],
    ] as const) {
      await bid(jobId, masters[master], price * 10_000);
    }
    expect((await estimates(viewer.auth)).items).toEqual([]);
    expect(PRICE_ESTIMATE.MIN_BIDS).toBe(5);
  });

  it('withdrawn, hidden, blocked, multi-category and old bids are not counted', async () => {
    await setup();
    const viewer = await signUp(app, 'CUSTOMER');
    await enough('FLOORING');
    const [a, b] = [await job('FLOORING'), await job('FLOORING')];
    const big = 900_000;
    await bid(a, masters[3], big, { status: 'WITHDRAWN' });
    await bid(b, masters[3], big, { hiddenAt: new Date() });
    const hiddenJob = await job('FLOORING', 'Москва', { hiddenAt: new Date() });
    await bid(hiddenJob, masters[2], big);
    const multi = await job('FLOORING', 'Москва', { extra: ['TILING'] });
    await bid(multi, masters[2], big);
    const old = await job('FLOORING');
    await bid(old, masters[2], big, {
      createdAt: new Date(Date.now() - (PRICE_ESTIMATE.WINDOW_DAYS + 1) * DAY_MS),
    });
    const blocked = (await signUp(app, 'CONTRACTOR')).id;
    await prisma.user.update({ where: { id: blocked }, data: { blockedAt: new Date() } });
    await bid(a, blocked, big);

    const [flooring] = (await estimates(viewer.auth)).items;
    expect(flooring).toMatchObject({ category: 'FLOORING', high: 25_000, bids: 5 });
  });

  it('a city with little data falls back to all cities; an unknown city is ignored', async () => {
    await setup();
    const viewer = await signUp(app, 'CUSTOMER');
    await enough('ELECTRICAL', 'Москва');
    const piter = await job('ELECTRICAL', 'Санкт-Петербург');
    await bid(piter, masters[3], 100_000);

    const [inPiter] = (await estimates(viewer.auth, '?city=Санкт-Петербург')).items;
    // Все города: 6 откликов, город не указан.
    expect(inPiter).toMatchObject({ category: 'ELECTRICAL', city: null, bids: 6 });
    const [unknown] = (await estimates(viewer.auth, '?city=Атлантида')).items;
    expect(unknown).toMatchObject({ city: null, bids: 6 });
  });

  it('needs a session; a too long city is 400', async () => {
    const viewer = await signUp(app, 'CONTRACTOR');
    await http().get('/v1/price-estimates').expect(401);
    await http()
      .get(`/v1/price-estimates?city=${'а'.repeat(101)}`)
      .set(viewer.auth)
      .expect(400);
    expect((await estimates(viewer.auth)).items).toEqual([]);
  });
});
