import type { JobDto, Paginated } from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { signUp } from './helpers';

const prisma = new PrismaClient();
const DAY_MS = 86_400_000;

describe('Catalog filters: budget, posted within, no bids, sort (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  // Метка в названии: заказы других тестов и демо-данные не мешают проверкам.
  const tag = `Фильтр${Date.now().toString(36)}`;

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
  const job = async (
    name: string,
    budgetMin: number | null,
    budgetMax: number | null,
    daysAgo = 0,
  ) =>
    (
      await prisma.job.create({
        data: {
          title: `${tag} ${name}`,
          description: 'Описание заказа для проверки фильтров каталога.',
          category: 'OTHER',
          city: 'Москва',
          ownerId,
          budgetMin,
          budgetMax,
          createdAt: new Date(Date.now() - daysAgo * DAY_MS),
        },
      })
    ).id;
  const names = async (query: string) => {
    const res = await http()
      .get(`/v1/jobs?q=${encodeURIComponent(tag)}&${query}`)
      .expect(200);
    return (res.body as Paginated<JobDto>).items.map((j) => j.title.replace(`${tag} `, ''));
  };

  beforeEach(async () => {
    ownerId = (await signUp(app, 'CUSTOMER')).id;
    await job('до 50', null, 50_000, 0);
    await job('от 100', 100_000, null, 2);
    await job('80–120', 80_000, 120_000, 10);
    await job('без бюджета', null, null, 40);
  });

  it('budget: the job range overlaps the requested one; no budget is left out', async () => {
    expect((await names('budgetFrom=60000')).sort()).toEqual(['80–120', 'от 100']);
    expect((await names('budgetTo=90000')).sort()).toEqual(['80–120', 'до 50']);
    expect(await names('budgetFrom=60000&budgetTo=90000')).toEqual(['80–120']);
    const wrong = await http().get('/v1/jobs?budgetFrom=10&budgetTo=5').expect(400);
    expect(wrong.body.code).toBe('BUDGET_RANGE_INVALID');
    await http().get('/v1/jobs?budgetFrom=-1').expect(400);
  });

  it('posted within 1, 7 or 30 days', async () => {
    expect(await names('days=1')).toEqual(['до 50']);
    expect(await names('days=7')).toEqual(['до 50', 'от 100']);
    expect(await names('days=30')).toEqual(['до 50', 'от 100', '80–120']);
    await http().get('/v1/jobs?days=3').expect(400);
  });

  it("no bids: withdrawn, hidden and blocked contractors' bids do not count", async () => {
    const [master, other] = [await signUp(app, 'CONTRACTOR'), await signUp(app, 'CONTRACTOR')];
    const byName = async (name: string) =>
      (await prisma.job.findFirstOrThrow({ where: { title: `${tag} ${name}` } })).id;
    const bid = (jobId: string, contractorId: string, extra = {}) =>
      prisma.bid.create({
        data: { jobId, contractorId, price: 1_000, comment: 'Сделаю.', ...extra },
      });
    await bid(await byName('до 50'), master.id);
    await bid(await byName('от 100'), master.id, { status: 'WITHDRAWN' });
    await bid(await byName('80–120'), other.id, { hiddenAt: new Date() });
    // Отклик заблокированного мастера тоже не в счёт: мастер недоступен (аудит F-06).
    const blocked = await signUp(app, 'CONTRACTOR');
    await bid(await byName('без бюджета'), blocked.id);
    await prisma.user.update({ where: { id: blocked.id }, data: { blockedAt: new Date() } });
    expect((await names('noBids=true')).sort()).toEqual(['80–120', 'без бюджета', 'от 100']);
    expect(await names('noBids=false')).toHaveLength(4);
    await http().get('/v1/jobs?noBids=maybe').expect(400);
  });

  it('sort by budget: by the lower or the upper bound, no budget last; default — newest', async () => {
    // Больше — по нижней границе: «от 100», «80–120», затем «до 50» (нижней нет, верхняя 50).
    expect(await names('sort=budget_desc')).toEqual(['от 100', '80–120', 'до 50', 'без бюджета']);
    // Меньше — по верхней: «до 50», «80–120», затем «от 100» (верхней нет).
    expect(await names('sort=budget_asc')).toEqual(['до 50', '80–120', 'от 100', 'без бюджета']);
    expect(await names('')).toEqual(['до 50', 'от 100', '80–120', 'без бюджета']);
    await http().get('/v1/jobs?sort=cheap').expect(400);
  });
});
