import { DRAFT_LIMITS } from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp } from './helpers';

const prisma = new PrismaClient();

const fullJob = {
  title: 'Укладка плитки в ванной',
  description: 'Ванная около 6 м², пол и стены, плитка куплена заказчиком.',
  category: 'TILING' as const,
  city: 'Москва',
  budgetMin: 40000,
  budgetMax: 60000,
  details: requiredAnswers('TILING'),
};

async function cleanDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.job.deleteMany();
  await prisma.jobDraft.deleteMany();
  await prisma.user.deleteMany();
}

describe('Job drafts (e2e)', () => {
  let app: NestExpressApplication;
  let owner: { auth: Record<string, string>; id: string };
  const http = () => request(app.getHttpServer());
  const save = (body: object, auth = owner.auth) =>
    http().post('/v1/me/drafts').set(auth).send(body);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDb();
    owner = await signUp(app, 'CUSTOMER');
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
  });

  it('saves an empty draft and a partial one without the publish checks', async () => {
    const empty = await save({}).expect(201);
    expect(empty.body).toMatchObject({
      title: null,
      description: null,
      category: null,
      city: null,
      budgetMin: null,
      budgetMax: null,
      details: {},
    });

    // Короткое название, город вне зоны и неверный ответ анкеты в черновике допустимы:
    // неверный ответ отбрасывается, остальное сохраняется как есть.
    const partial = await save({
      title: '  Плит  ',
      category: 'TILING',
      city: 'Казань',
      description: '   ',
      details: { rooms: ['bathroom'], tileType: 'gold', unknown: 1 },
    }).expect(201);
    expect(partial.body).toMatchObject({
      title: 'Плит',
      category: 'TILING',
      city: 'Казань',
      description: null,
      details: { rooms: ['bathroom'] },
    });
  });

  it('replaces a draft and lists drafts newest first', async () => {
    const a = (await save({ title: 'Первый' }).expect(201)).body;
    const b = (await save({ title: 'Второй' }).expect(201)).body;
    const updated = await http()
      .put(`/v1/me/drafts/${a.id}`)
      .set(owner.auth)
      .send({ title: 'Первый, правка', category: 'OTHER' })
      .expect(200);
    expect(updated.body).toMatchObject({ id: a.id, title: 'Первый, правка', category: 'OTHER' });

    const list = await http().get('/v1/me/drafts').set(owner.auth).expect(200);
    expect(list.body.items.map((d: { id: string }) => d.id)).toEqual([a.id, b.id]);
  });

  it.each([
    [{ title: 'я'.repeat(161) }, 'Название: не больше 160 символов'],
    [{ budgetMin: -1 }, 'Бюджет не может быть отрицательным'],
    [{ category: 'GARDENING' }, 'Выберите категорию из списка'],
    [{ details: ['rooms'] }, 'Ответы на вопросы передаются объектом'],
    [{ title: 'Плитка‮' }, 'Название содержит недопустимые символы'],
  ])('rejects %j with a clear 400', async (body, message) => {
    const res = await save(body).expect(400);
    expect(JSON.stringify(res.body.message)).toContain(message);
    expect(await prisma.jobDraft.count()).toBe(0);
  });

  it(`keeps at most ${DRAFT_LIMITS.MAX_PER_USER} drafts per customer`, async () => {
    for (let i = 0; i < DRAFT_LIMITS.MAX_PER_USER; i += 1)
      await save({ title: `Черновик ${i}` }).expect(201);
    const res = await save({ title: 'Лишний' }).expect(409);
    expect(res.body.message).toContain('не больше 10 черновиков');
    // Другой заказчик со своим лимитом.
    const other = await signUp(app, 'CUSTOMER');
    await save({ title: 'Свой' }, other.auth).expect(201);
  });

  it('hides drafts from other users and contractors', async () => {
    const draft = (await save({ title: 'Мой черновик' }).expect(201)).body;
    const stranger = await signUp(app, 'CUSTOMER');
    await http().get(`/v1/me/drafts/${draft.id}`).set(stranger.auth).expect(404);
    await http()
      .put(`/v1/me/drafts/${draft.id}`)
      .set(stranger.auth)
      .send({ title: 'Чужое' })
      .expect(404);
    await http().delete(`/v1/me/drafts/${draft.id}`).set(stranger.auth).expect(404);
    expect((await http().get('/v1/me/drafts').set(stranger.auth).expect(200)).body.items).toEqual(
      [],
    );

    const contractor = await signUp(app, 'CONTRACTOR');
    await http().get('/v1/me/drafts').set(contractor.auth).expect(403);
    await save({ title: 'Нельзя' }, contractor.auth).expect(403);
    await http().get('/v1/me/drafts').expect(401);

    const still = await http().get(`/v1/me/drafts/${draft.id}`).set(owner.auth).expect(200);
    expect(still.body.title).toBe('Мой черновик');
  });

  it('deletes a draft', async () => {
    const draft = (await save({ title: 'Удалю' }).expect(201)).body;
    await http().delete(`/v1/me/drafts/${draft.id}`).set(owner.auth).expect(204);
    await http().get(`/v1/me/drafts/${draft.id}`).set(owner.auth).expect(404);
  });

  it('publishing with draftId creates the job and removes only the own draft', async () => {
    const draft = (await save({ title: 'Плитка' }).expect(201)).body;
    const stranger = await signUp(app, 'CUSTOMER');
    const foreign = (await save({ title: 'Чужой черновик' }, stranger.auth).expect(201)).body;

    // Неполный заказ не публикуется, черновик остаётся.
    await http()
      .post('/v1/me/jobs')
      .set(owner.auth)
      .send({ ...fullJob, title: 'Плит', draftId: draft.id })
      .expect(400);
    expect(await prisma.jobDraft.count({ where: { id: draft.id } })).toBe(1);

    const job = await http()
      .post('/v1/me/jobs')
      .set(owner.auth)
      .send({ ...fullJob, draftId: draft.id })
      .expect(201);
    expect(job.body.title).toBe(fullJob.title);
    expect(await prisma.jobDraft.count({ where: { id: draft.id } })).toBe(0);

    // Чужой draftId: как уже опубликованный — 409 без заказа, чужой черновик не трогается.
    await http()
      .post('/v1/me/jobs')
      .set(owner.auth)
      .send({ ...fullJob, draftId: foreign.id })
      .expect(409);
    expect(await prisma.jobDraft.count({ where: { id: foreign.id } })).toBe(1);

    await http()
      .post('/v1/me/jobs')
      .set(owner.auth)
      .send({ ...fullJob, draftId: 'bad id!' })
      .expect(400);
  });

  it('never shows drafts in the public catalog', async () => {
    await save({ ...fullJob }).expect(201);
    const catalog = await http().get('/v1/jobs?limit=50').expect(200);
    expect(catalog.body.total).toBe(0);
  });
});
