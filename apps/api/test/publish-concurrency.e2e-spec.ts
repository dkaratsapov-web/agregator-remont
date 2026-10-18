import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp } from './helpers';

/**
 * Публикация заказа из черновика под гонками (ТЗ #28, P1.2): двойное нажатие, две вкладки,
 * повтор запроса после обрыва сети, автосохранение в полёте. После успешной публикации — ровно
 * один заказ и ни одного черновика; повтор получает 409, а не второй заказ.
 */

const prisma = new PrismaClient();

const job = {
  title: 'Укладка плитки в ванной',
  description: 'Нужно уложить плитку на пол и стены в ванной комнате, около 12 м².',
  category: 'OTHER',
  details: requiredAnswers('OTHER'),
  city: 'Москва',
};

describe('Publish from draft under races (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  const clean = async () => {
    await prisma.auditLog.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany();
    await prisma.jobDraft.deleteMany();
    await prisma.user.deleteMany();
  };

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });
  beforeEach(clean);
  afterAll(async () => {
    await clean();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
  });

  async function withDraft() {
    const owner = await signUp(app, 'CUSTOMER');
    const draft = await http()
      .post('/v1/me/drafts')
      .set(owner.auth)
      .send({ title: job.title })
      .expect(201);
    return { owner, draftId: draft.body.id as string };
  }
  const publish = (auth: Record<string, string>, draftId?: string) =>
    http()
      .post('/v1/me/jobs')
      .set(auth)
      .send(draftId ? { ...job, draftId } : job);

  it('пять одновременных публикаций одного черновика: один заказ, ноль черновиков, остальные 409', async () => {
    const { owner, draftId } = await withDraft();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => publish(owner.auth, draftId)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    expect(await prisma.job.count({ where: { ownerId: owner.id } })).toBe(1);
    expect(await prisma.jobDraft.count({ where: { ownerId: owner.id } })).toBe(0);
    const conflict = results.find((r) => r.status === 409)!;
    expect(conflict.body.message).toMatch(/уже опубликован/);
  });

  it('повтор той же публикации после обрыва связи не создаёт второй заказ', async () => {
    const { owner, draftId } = await withDraft();
    await publish(owner.auth, draftId).expect(201);
    await publish(owner.auth, draftId).expect(409);
    expect(await prisma.job.count({ where: { ownerId: owner.id } })).toBe(1);
  });

  it('автосохранение, пришедшее после публикации, не воскрешает черновик', async () => {
    const { owner, draftId } = await withDraft();
    const [published, saved] = await Promise.all([
      publish(owner.auth, draftId),
      http().put(`/v1/me/drafts/${draftId}`).set(owner.auth).send({ title: 'Поздняя правка' }),
    ]);
    expect(published.status).toBe(201);
    // Сохранение успело раньше (200) или черновика уже нет (404) — но не новый черновик.
    expect([200, 404]).toContain(saved.status);
    expect(await prisma.jobDraft.count({ where: { ownerId: owner.id } })).toBe(0);
    expect(await prisma.job.count({ where: { ownerId: owner.id } })).toBe(1);
  });

  it('чужой черновик не мешает публикации и не удаляется', async () => {
    const { draftId } = await withDraft();
    const other = await signUp(app, 'CUSTOMER');
    await publish(other.auth, draftId).expect(409);
    expect(await prisma.jobDraft.count({ where: { id: draftId } })).toBe(1);
    expect(await prisma.job.count({ where: { ownerId: other.id } })).toBe(0);
  });

  it('публикация без черновика по-прежнему работает', async () => {
    const owner = await signUp(app, 'CUSTOMER');
    await publish(owner.auth).expect(201);
    expect(await prisma.job.count({ where: { ownerId: owner.id } })).toBe(1);
  });
});
