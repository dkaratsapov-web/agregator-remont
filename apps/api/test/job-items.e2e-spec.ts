import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp } from './helpers';

const prisma = new PrismaClient();

const tiling = {
  title: 'Ванная: плитка, сантехника и свет',
  description: 'Ванная 6 м²: плитка на пол и стены, заменить смеситель и светильники.',
  category: 'TILING' as const,
  city: 'Москва',
  budgetMin: 150_000,
  budgetMax: 220_000,
  details: requiredAnswers('TILING'),
};
const plumbing = { category: 'PLUMBING', details: requiredAnswers('PLUMBING') };
const electrical = { category: 'ELECTRICAL', details: requiredAnswers('ELECTRICAL') };

async function cleanDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.job.deleteMany();
  await prisma.jobDraft.deleteMany();
  await prisma.user.deleteMany();
}

describe('Several categories in one job (e2e)', () => {
  let app: NestExpressApplication;
  let auth: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const create = (body: object) => http().post('/v1/me/jobs').set(auth).send(body);
  const patch = (id: string, body: object) =>
    http().patch(`/v1/me/jobs/${id}`).set(auth).send(body);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDb();
    auth = (await signUp(app, 'CUSTOMER')).auth;
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
  });

  it('creates a job with extra positions and finds it by any category', async () => {
    const res = await create({ ...tiling, extraItems: [plumbing, electrical] }).expect(201);
    expect(res.body.category).toBe('TILING');
    expect(res.body.extraItems.map((i: { category: string }) => i.category)).toEqual([
      'PLUMBING',
      'ELECTRICAL',
    ]);
    const row = await prisma.job.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.categories).toEqual(['TILING', 'PLUMBING', 'ELECTRICAL']);

    for (const category of ['TILING', 'PLUMBING', 'ELECTRICAL']) {
      const list = await http().get(`/v1/jobs?category=${category}`).expect(200);
      expect(list.body.items.map((j: { id: string }) => j.id)).toEqual([res.body.id]);
    }
    expect((await http().get('/v1/jobs?category=ROOFING').expect(200)).body.total).toBe(0);

    const publicJob = await http().get(`/v1/jobs/${res.body.id}`).expect(200);
    expect(publicJob.body.extraItems).toHaveLength(2);
  });

  it('a job without positions keeps working as before', async () => {
    const res = await create(tiling).expect(201);
    expect(res.body.extraItems).toEqual([]);
    const row = await prisma.job.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.categories).toEqual(['TILING']);
  });

  it.each<[string, unknown, string]>([
    ['the main category again', [{ ...plumbing, category: 'TILING' }], 'уже есть в заказе'],
    ['a repeated category', [plumbing, plumbing], 'уже есть в заказе'],
    [
      'an unknown category',
      [{ category: 'GARDENING', details: {} }],
      'Позиция 2: выберите категорию',
    ],
    [
      'a missing required answer',
      [{ category: 'PLUMBING', details: {} }],
      'Позиция 2 («Сантехника»)',
    ],
    ['an object instead of a list', { category: 'PLUMBING' }, 'Позиции заказа передаются списком'],
    [
      'too many positions',
      ['PLUMBING', 'ELECTRICAL', 'FINISHING', 'FLOORING', 'ROOFING'].map((category) => ({
        category,
        details: {},
      })),
      'не больше 5 категорий',
    ],
  ])('rejects %s with a clear 400', async (_name, extraItems, message) => {
    const res = await create({ ...tiling, extraItems }).expect(400);
    expect(JSON.stringify(res.body.message)).toContain(message);
    expect(await prisma.job.count()).toBe(0);
  });

  it('replaces positions on update and keeps them when not sent', async () => {
    const { body: job } = await create({ ...tiling, extraItems: [plumbing] }).expect(201);
    const kept = await patch(job.id, { title: 'Ванная под ключ: плитка и сантехника' }).expect(200);
    expect(kept.body.extraItems.map((i: { category: string }) => i.category)).toEqual(['PLUMBING']);

    const replaced = await patch(job.id, { extraItems: [electrical] }).expect(200);
    expect(replaced.body.extraItems.map((i: { category: string }) => i.category)).toEqual([
      'ELECTRICAL',
    ]);
    const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.categories).toEqual(['TILING', 'ELECTRICAL']);

    const cleared = await patch(job.id, { extraItems: [] }).expect(200);
    expect(cleared.body.extraItems).toEqual([]);

    const audit = await prisma.auditLog.findMany({
      where: { entityId: job.id, action: 'JOB_UPDATED' },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => Object.keys(a.changes as object))).toEqual([
      ['title'],
      ['extraItems'],
      ['extraItems'],
    ]);
  });

  it('does not let the main category collide with a position', async () => {
    const { body: job } = await create({ ...tiling, extraItems: [plumbing] }).expect(201);
    const res = await patch(job.id, {
      category: 'PLUMBING',
      details: requiredAnswers('PLUMBING'),
    }).expect(400);
    expect(res.body.message).toContain('уже есть в заказе');
    // С заменой позиций смена основной категории проходит.
    await patch(job.id, {
      category: 'PLUMBING',
      details: requiredAnswers('PLUMBING'),
      extraItems: [{ category: 'TILING', details: requiredAnswers('TILING') }],
    }).expect(200);
    const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.categories).toEqual(['PLUMBING', 'TILING']);
  });

  it('the database keeps the category list in sync on direct writes too', async () => {
    const me = await http().get('/v1/me').set(auth).expect(200);
    const row = await prisma.job.create({
      data: {
        ...tiling,
        ownerId: me.body.id,
        extraItems: [{ category: 'ROOFING', details: {} }],
        categories: ['OTHER'],
      },
    });
    expect(row.categories).toEqual(['TILING', 'ROOFING']);
  });

  it('drafts keep positions leniently', async () => {
    const res = await http()
      .post('/v1/me/drafts')
      .set(auth)
      .send({
        category: 'TILING',
        extraItems: [
          { category: 'PLUMBING', details: { task: 'leak', unknown: 1 } },
          { category: 'TILING', details: {} },
          { category: 'GARDENING' },
        ],
      })
      .expect(201);
    expect(res.body.extraItems).toEqual([{ category: 'PLUMBING', details: { task: 'leak' } }]);
  });
});
