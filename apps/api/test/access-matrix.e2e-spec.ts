import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp, signUpAdmin } from './helpers';

/**
 * Матрица доступа (ТЗ #28, P1.1): гость, заказчик A, заказчик B, подрядчик A, подрядчик B и
 * администратор против каждого маршрута /v1/me/*, черновиков, заказов, откликов и заявок.
 * Чужое — 401 (без сессии), 403 (не та роль) или 404 (не владелец: существование чужого объекта
 * не раскрывается). После каждой попытки проверяется, что чужие данные не изменились.
 */

const prisma = new PrismaClient();

const validJob = {
  title: 'Замена проводки в квартире',
  description: 'Нужна полная замена проводки в двухкомнатной квартире, около 50 м².',
  category: 'ELECTRICAL',
  details: requiredAnswers('ELECTRICAL'),
  city: 'Санкт-Петербург',
  budgetMin: 80_000,
  budgetMax: 120_000,
};
const bid = { price: 95_000, durationDays: 10, comment: 'Сделаю за 10 дней, свой инструмент.' };

type Actor = { auth: Record<string, string>; id: string; token: string };

describe('Access matrix (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  let customerA: Actor;
  let customerB: Actor;
  let contractorA: Actor;
  let contractorB: Actor;
  let admin: Actor;
  let jobA: string;
  let draftA: string;
  let bidA: string;
  let leadId: string;

  const clean = async () => {
    await prisma.auditLog.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany();
    await prisma.jobDraft.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.user.deleteMany();
  };

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
    await clean();

    customerA = await signUp(app, 'CUSTOMER');
    customerB = await signUp(app, 'CUSTOMER');
    contractorA = await signUp(app, 'CONTRACTOR');
    contractorB = await signUp(app, 'CONTRACTOR');
    admin = await signUpAdmin(app, prisma);

    jobA = (await http().post('/v1/me/jobs').set(customerA.auth).send(validJob).expect(201)).body
      .id;
    draftA = (
      await http()
        .post('/v1/me/drafts')
        .set(customerA.auth)
        .send({ title: 'Черновик A' })
        .expect(201)
    ).body.id;
    bidA = (await http().post(`/v1/jobs/${jobA}/bids`).set(contractorA.auth).send(bid).expect(201))
      .body.id;
    const avatar = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#c2410c' },
    })
      .png()
      .toBuffer();
    await http()
      .put('/v1/me/avatar')
      .set(customerA.auth)
      .attach('file', avatar, 'a.png')
      .expect(200);
    leadId = (
      await prisma.lead.create({
        data: { name: 'Заявка', phone: '+79001234567', consentVersion: '2026-10-17' },
      })
    ).id;
  });

  afterAll(async () => {
    await clean();
    await app.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
  });

  /** Отказ без раскрытия: 403 (роль) или 404 (не владелец). */
  const denied = (status: number) => expect([403, 404]).toContain(status);

  describe('без сессии — 401 на каждом закрытом маршруте', () => {
    const routes: [string, string][] = [
      ['get', '/v1/me'],
      ['patch', '/v1/me'],
      ['patch', '/v1/me/preferences'],
      ['post', '/v1/me/password'],
      ['get', '/v1/me/sessions'],
      ['delete', '/v1/me/sessions/x'],
      ['post', '/v1/me/sessions/revoke-others'],
      ['get', '/v1/me/avatar'],
      ['put', '/v1/me/avatar'],
      ['delete', '/v1/me/avatar'],
      ['get', '/v1/me/jobs'],
      ['post', '/v1/me/jobs'],
      ['get', '/v1/me/jobs/x'],
      ['patch', '/v1/me/jobs/x'],
      ['post', '/v1/me/jobs/x/close'],
      ['get', '/v1/me/drafts'],
      ['post', '/v1/me/drafts'],
      ['get', '/v1/me/drafts/x'],
      ['put', '/v1/me/drafts/x'],
      ['delete', '/v1/me/drafts/x'],
      ['get', '/v1/me/profile'],
      ['put', '/v1/me/profile'],
      ['get', '/v1/me/bids'],
      ['post', '/v1/me/bids/x/withdraw'],
      ['get', '/v1/me/jobs/x/bids'],
      ['post', '/v1/me/jobs/x/bids/y/accept'],
      ['post', '/v1/jobs/x/bids'],
      ['get', '/v1/admin/leads'],
      ['patch', '/v1/admin/leads/x'],
      ['post', '/v1/auth/logout'],
    ];
    it.each(routes)('%s %s', async (method, path) => {
      const res = await (http() as unknown as Record<string, (p: string) => request.Test>)
        [method](path)
        .send({});
      expect(res.status).toBe(401);
    });

    it('поддельный и чужой формат токена — 401', async () => {
      await http().get('/v1/me').set('Authorization', 'Bearer forged-token').expect(401);
      await http().get('/v1/me').set('Authorization', `Basic ${customerA.token}`).expect(401);
      await http().get('/v1/me').set('Cookie', 'ar_session=forged').expect(401);
    });
  });

  describe('роли', () => {
    it('подрядчик и админ не пользуются маршрутами заказчика', async () => {
      for (const actor of [contractorA, admin]) {
        expect((await http().get('/v1/me/jobs').set(actor.auth)).status).toBe(403);
        expect((await http().post('/v1/me/jobs').set(actor.auth).send(validJob)).status).toBe(403);
        expect((await http().get('/v1/me/drafts').set(actor.auth)).status).toBe(403);
        expect((await http().get(`/v1/me/jobs/${jobA}/bids`).set(actor.auth)).status).toBe(403);
      }
    });

    it('заказчик и админ не откликаются и не правят профиль подрядчика', async () => {
      for (const actor of [customerB, admin]) {
        expect((await http().post(`/v1/jobs/${jobA}/bids`).set(actor.auth).send(bid)).status).toBe(
          403,
        );
        expect((await http().get('/v1/me/bids').set(actor.auth)).status).toBe(403);
        expect((await http().get('/v1/me/profile').set(actor.auth)).status).toBe(403);
      }
    });

    it('заявки видит только админ', async () => {
      for (const actor of [customerA, contractorA]) {
        expect((await http().get('/v1/admin/leads').set(actor.auth)).status).toBe(403);
        expect(
          (
            await http()
              .patch(`/v1/admin/leads/${leadId}`)
              .set(actor.auth)
              .send({ processed: true })
          ).status,
        ).toBe(403);
      }
      await http().get('/v1/admin/leads').set(admin.auth).expect(200);
      expect(
        (await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).processedAt,
      ).toBeNull();
    });

    it('роль ADMIN нельзя получить ни регистрацией, ни правкой профиля, ни заголовком', async () => {
      await http()
        .post('/v1/auth/register')
        .send({
          email: `admin-${Date.now()}@example.ru`,
          password: 'correct-horse-battery',
          name: 'Хочу админа',
          role: 'ADMIN',
        })
        .expect(400);
      expect(
        (await http().patch('/v1/me').set(customerB.auth).send({ role: 'ADMIN' })).status,
      ).toBe(400);
      await http()
        .get('/v1/admin/leads')
        .set(customerB.auth)
        .set('X-User-Role', 'ADMIN')
        .expect(403);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: customerB.id } })).role).toBe(
        'CUSTOMER',
      );
    });
  });

  describe('чужие объекты (IDOR)', () => {
    it('заказ заказчика A недоступен заказчику B для чтения, правки, закрытия и откликов', async () => {
      denied((await http().get(`/v1/me/jobs/${jobA}`).set(customerB.auth)).status);
      denied(
        (await http().patch(`/v1/me/jobs/${jobA}`).set(customerB.auth).send({ title: 'Взлом' }))
          .status,
      );
      denied((await http().post(`/v1/me/jobs/${jobA}/close`).set(customerB.auth)).status);
      denied((await http().get(`/v1/me/jobs/${jobA}/bids`).set(customerB.auth)).status);
      denied(
        (await http().post(`/v1/me/jobs/${jobA}/bids/${bidA}/accept`).set(customerB.auth)).status,
      );
      const list = await http().get('/v1/me/jobs').set(customerB.auth).expect(200);
      expect(JSON.stringify(list.body)).not.toContain(jobA);

      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobA } });
      expect(job.title).toBe(validJob.title);
      expect(job.status).toBe('OPEN');
      const accepted = await prisma.bid.findUniqueOrThrow({ where: { id: bidA } });
      expect(accepted.status).toBe('PENDING');
    });

    it('черновик заказчика A недоступен заказчику B', async () => {
      denied((await http().get(`/v1/me/drafts/${draftA}`).set(customerB.auth)).status);
      denied(
        (await http().put(`/v1/me/drafts/${draftA}`).set(customerB.auth).send({ title: 'Взлом' }))
          .status,
      );
      denied((await http().delete(`/v1/me/drafts/${draftA}`).set(customerB.auth)).status);
      const list = await http().get('/v1/me/drafts').set(customerB.auth).expect(200);
      expect(JSON.stringify(list.body)).not.toContain(draftA);
      const draft = await prisma.jobDraft.findUniqueOrThrow({ where: { id: draftA } });
      expect(draft.title).toBe('Черновик A');
    });

    it('отклик подрядчика A не может отозвать подрядчик B и не видит в своём списке', async () => {
      denied((await http().post(`/v1/me/bids/${bidA}/withdraw`).set(contractorB.auth)).status);
      const list = await http().get('/v1/me/bids').set(contractorB.auth).expect(200);
      expect(JSON.stringify(list.body)).not.toContain(bidA);
      expect((await prisma.bid.findUniqueOrThrow({ where: { id: bidA } })).status).toBe('PENDING');
    });

    it('фото профиля: только своё (у B нет фото — 404, хотя у A есть)', async () => {
      await http().get('/v1/me/avatar').set(customerA.auth).expect(200);
      await http().get('/v1/me/avatar').set(customerB.auth).expect(404);
      await http().delete('/v1/me/avatar').set(customerB.auth).expect(200);
      await http().get('/v1/me/avatar').set(customerA.auth).expect(200);
    });

    it('чужую сессию нельзя ни увидеть, ни отозвать', async () => {
      const sessionsA = (await http().get('/v1/me/sessions').set(customerA.auth).expect(200)).body;
      const idA = (Array.isArray(sessionsA) ? sessionsA : sessionsA.items)[0].id as string;
      const sessionsB = (await http().get('/v1/me/sessions').set(customerB.auth).expect(200)).body;
      expect(JSON.stringify(sessionsB)).not.toContain(idA);
      denied((await http().delete(`/v1/me/sessions/${idA}`).set(customerB.auth)).status);
      await http().post('/v1/me/sessions/revoke-others').set(customerB.auth).expect(200);
      await http().get('/v1/me').set(customerA.auth).expect(200);
    });

    it('/v1/me отдаёт только свои данные, без хеша пароля и чужих полей', async () => {
      const me = (await http().get('/v1/me').set(customerB.auth).expect(200)).body;
      expect(me.id).toBe(customerB.id);
      const text = JSON.stringify(me);
      expect(text).not.toMatch(/passwordHash|password_hash|\$argon2|tokenHash/);
      expect(text).not.toContain(customerA.id);
    });

    it('каталог заказов открыт без сессии, но без контактов заказчика', async () => {
      const list = await http().get('/v1/jobs').expect(200);
      const one = await http().get(`/v1/jobs/${jobA}`).expect(200);
      for (const text of [JSON.stringify(list.body), JSON.stringify(one.body)]) {
        expect(text).not.toMatch(/@example\.ru|passwordHash|\+7\d{10}/);
      }
    });
  });

  describe('сессии', () => {
    it('после выхода токен не действует', async () => {
      const user = await signUp(app, 'CUSTOMER');
      await http().post('/v1/auth/logout').set(user.auth).expect(204);
      await http().get('/v1/me').set(user.auth).expect(401);
    });

    it('отозванная сессия перестаёт действовать сразу', async () => {
      const email = `two-${Date.now()}@example.ru`;
      const register = await http()
        .post('/v1/auth/register')
        .send({ email, password: 'correct-horse-battery', name: 'Два входа', role: 'CUSTOMER' })
        .expect(201);
      const first = { Authorization: `Bearer ${register.body.token}` };
      const login = await http()
        .post('/v1/auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);
      const second = { Authorization: `Bearer ${login.body.token}` };
      await http().post('/v1/me/sessions/revoke-others').set(second).expect(200);
      await http().get('/v1/me').set(first).expect(401);
      await http().get('/v1/me').set(second).expect(200);
    });

    it('смена пароля завершает остальные сессии, текущая остаётся', async () => {
      const email = `pass-${Date.now()}@example.ru`;
      const register = await http()
        .post('/v1/auth/register')
        .send({ email, password: 'correct-horse-battery', name: 'Пароль', role: 'CUSTOMER' })
        .expect(201);
      const other = { Authorization: `Bearer ${register.body.token}` };
      const login = await http()
        .post('/v1/auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);
      const current = { Authorization: `Bearer ${login.body.token}` };
      await http()
        .post('/v1/me/password')
        .set(current)
        .send({ currentPassword: 'correct-horse-battery', newPassword: 'another-long-password-1' })
        .expect((res) => expect([200, 204]).toContain(res.status));
      await http().get('/v1/me').set(other).expect(401);
      await http().get('/v1/me').set(current).expect(200);
      await http()
        .post('/v1/auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(401);
    });
  });
});
