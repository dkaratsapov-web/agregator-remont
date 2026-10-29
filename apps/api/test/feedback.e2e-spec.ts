import {
  FEEDBACK_LIMITS,
  type AdminFeedbackDto,
  type FeedbackDto,
  type Paginated,
} from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { signUp, signUpAdmin } from './helpers';

/**
 * Обратная связь тестировщиков (docs/FEEDBACK.md): обращение из кабинета, «Мои обращения»,
 * очередь и ответ администратора. Чужие обращения не видны, ответить может только администратор.
 */

const prisma = new PrismaClient();
const bug = {
  kind: 'BUG',
  body: 'Кнопка «Опубликовать» не нажимается на телефоне.',
  page: '/account/jobs/new',
};

describe('Feedback (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  const clean = async () => {
    await prisma.auditLog.deleteMany();
    await prisma.feedback.deleteMany();
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

  const send = (auth: Record<string, string>, body: object) =>
    http().post('/v1/me/feedback').set(auth).send(body);

  it('any signed-in role sends feedback and sees only their own', async () => {
    const customer = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');
    const created = (await send(customer.auth, bug).expect(201)).body as FeedbackDto;
    expect(created).toMatchObject({ ...bug, reply: null, repliedAt: null });
    await send(contractor.auth, { kind: 'IDEA', body: 'Добавьте фильтр по району города.' }).expect(
      201,
    );

    const mine = (await http().get('/v1/me/feedback').set(customer.auth).expect(200))
      .body as FeedbackDto[];
    expect(mine.map((f) => f.id)).toEqual([created.id]);
    expect(mine[0].page).toBe('/account/jobs/new');
    await http().post('/v1/me/feedback').send(bug).expect(401);
    await http().get('/v1/me/feedback').expect(401);
  });

  it.each([
    ['unknown kind', { ...bug, kind: 'RANT' }],
    ['too short', { ...bug, body: 'плохо' }],
    ['too long', { ...bug, body: 'а'.repeat(FEEDBACK_LIMITS.BODY_MAX + 1) }],
    ['page is a full address', { ...bug, page: 'https://evil.example/x' }],
    ['page with spaces', { ...bug, page: '/a b' }],
    ['unknown field', { ...bug, admin: true }],
  ])('rejects %s (400)', async (_name, body) => {
    const user = await signUp(app, 'CUSTOMER');
    const res = await send(user.auth, body).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(await prisma.feedback.count()).toBe(0);
  });

  it('a daily limit per person (429 with Retry-After)', async () => {
    const user = await signUp(app, 'CUSTOMER');
    for (let i = 0; i < FEEDBACK_LIMITS.PER_DAY_MAX; i += 1) await send(user.auth, bug).expect(201);
    const res = await send(user.auth, bug).expect(429);
    expect(res.body.code).toBe('DAILY_QUOTA_EXCEEDED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    // Лимит у каждого свой.
    await send((await signUp(app, 'CUSTOMER')).auth, bug).expect(201);
  });

  it('admin: queue of unanswered, reply once, the author sees the reply; audit', async () => {
    const admin = await signUpAdmin(app, prisma);
    const user = await signUp(app, 'CONTRACTOR');
    const { id } = (await send(user.auth, bug).expect(201)).body as FeedbackDto;

    const open = (await http().get('/v1/admin/feedback?status=open').set(admin.auth).expect(200))
      .body as Paginated<AdminFeedbackDto>;
    expect(open.total).toBe(1);
    expect(open.items[0]).toMatchObject({ id, author: { id: user.id, role: 'CONTRACTOR' } });

    const replied = (
      await http()
        .post(`/v1/admin/feedback/${id}/reply`)
        .set(admin.auth)
        .send({ reply: 'Спасибо, исправим в ближайшем обновлении.' })
        .expect(200)
    ).body as AdminFeedbackDto;
    expect(replied.reply).toBe('Спасибо, исправим в ближайшем обновлении.');
    expect(replied.repliedAt).not.toBeNull();

    const mine = (await http().get('/v1/me/feedback').set(user.auth).expect(200))
      .body as FeedbackDto[];
    expect(mine[0].reply).toBe('Спасибо, исправим в ближайшем обновлении.');
    const queue = (await http().get('/v1/admin/feedback?status=open').set(admin.auth).expect(200))
      .body as Paginated<AdminFeedbackDto>;
    expect(queue.total).toBe(0);
    const answered = (
      await http().get('/v1/admin/feedback?status=answered').set(admin.auth).expect(200)
    ).body as Paginated<AdminFeedbackDto>;
    expect(answered.items.map((f) => f.id)).toEqual([id]);

    // Второй ответ не затирает первый.
    const again = await http()
      .post(`/v1/admin/feedback/${id}/reply`)
      .set(admin.auth)
      .send({ reply: 'Другой ответ' })
      .expect(409);
    expect(again.body.code).toBe('CONFLICT');
    expect(
      await prisma.auditLog.count({ where: { action: 'FEEDBACK_REPLIED', entityId: id } }),
    ).toBe(1);
  });

  it('the author learns about a reply: the summary counts it until seen', async () => {
    const admin = await signUpAdmin(app, prisma);
    const user = await signUp(app, 'CUSTOMER');
    const other = await signUp(app, 'CUSTOMER');
    const summary = async (auth: Record<string, string>) =>
      (await http().get('/v1/me/notifications/summary').set(auth).expect(200)).body
        .feedbackReplies as number;
    const mine = async () =>
      (await http().get('/v1/me/feedback').set(user.auth).expect(200)).body as FeedbackDto[];

    const { id } = (await send(user.auth, bug).expect(201)).body as FeedbackDto;
    await send(other.auth, bug).expect(201);
    // Без ответа — нечего смотреть.
    expect(await summary(user.auth)).toBe(0);
    expect((await mine())[0].unseen).toBe(false);

    await http()
      .post(`/v1/admin/feedback/${id}/reply`)
      .set(admin.auth)
      .send({ reply: 'Спасибо, исправили.' })
      .expect(200);
    expect(await summary(user.auth)).toBe(1);
    expect((await mine())[0].unseen).toBe(true);
    expect(await summary(other.auth)).toBe(0);

    await http().post('/v1/me/feedback/seen').set(user.auth).expect(204);
    expect(await summary(user.auth)).toBe(0);
    expect((await mine())[0].unseen).toBe(false);
    // Повтор ничего не меняет; без сессии — 401.
    await http().post('/v1/me/feedback/seen').set(user.auth).expect(204);
    await http().post('/v1/me/feedback/seen').expect(401);
  });

  it('only admin sees the queue and replies; unknown id is 404', async () => {
    const admin = await signUpAdmin(app, prisma);
    const user = await signUp(app, 'CUSTOMER');
    const { id } = (await send(user.auth, bug).expect(201)).body as FeedbackDto;
    await http().get('/v1/admin/feedback').set(user.auth).expect(403);
    await http()
      .post(`/v1/admin/feedback/${id}/reply`)
      .set(user.auth)
      .send({ reply: 'Сам себе отвечу' })
      .expect(403);
    await http()
      .post('/v1/admin/feedback/cmissing0000000000000000/reply')
      .set(admin.auth)
      .send({ reply: 'Ответ' })
      .expect(404);
    await http()
      .post(`/v1/admin/feedback/${id}/reply`)
      .set(admin.auth)
      .send({ reply: 'а' })
      .expect(400);
  });

  it('two admins reply at once: one wins, the other gets 409', async () => {
    const [a, b] = [await signUpAdmin(app, prisma), await signUpAdmin(app, prisma)];
    const user = await signUp(app, 'CUSTOMER');
    const { id } = (await send(user.auth, bug).expect(201)).body as FeedbackDto;
    const results = await Promise.all(
      [a, b].map((admin, i) =>
        http()
          .post(`/v1/admin/feedback/${id}/reply`)
          .set(admin.auth)
          .send({ reply: `Ответ ${i + 1}` }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.auditLog.count({ where: { action: 'FEEDBACK_REPLIED', entityId: id } }),
    ).toBe(1);
  });

  it('feedback is in the data export and is erased when the account is deleted', async () => {
    const res = await http()
      .post('/v1/auth/register')
      .send({
        email: `fb-${Date.now()}@example.ru`,
        password: 'correct-horse-battery',
        name: 'Тест',
        role: 'CUSTOMER',
      })
      .expect(201);
    const auth = { Authorization: `Bearer ${res.body.token}` };
    await send(auth, bug).expect(201);
    const data = (await http().get('/v1/me/export').set(auth).expect(200)).body;
    expect(data.feedback).toMatchObject([{ kind: 'BUG', body: bug.body }]);
    await http()
      .post('/v1/me/delete')
      .set(auth)
      .send({ password: 'correct-horse-battery' })
      .expect(204);
    expect(await prisma.feedback.count({ where: { userId: res.body.user.id } })).toBe(0);
  });
});
