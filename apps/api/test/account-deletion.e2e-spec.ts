import type { AccountExportDto } from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp, signUpAdmin } from './helpers';

/**
 * Выгрузка своих данных и удаление аккаунта (152-ФЗ, docs/ACCOUNTS.md). Удаление стирает
 * личные данные и блокирует аккаунт навсегда; заказы, отклики и переписка остаются у другой
 * стороны без имени. Во время заказа в работе удалить аккаунт нельзя.
 */

const prisma = new PrismaClient();
const PASSWORD = 'correct-horse-battery';
const DELETED_NAME = 'Удалённый пользователь';

const jobBody = {
  title: 'Замена смесителя на кухне',
  description: 'Нужно заменить смеситель на кухне, смеситель уже куплен, нужен мастер.',
  category: 'PLUMBING',
  details: requiredAnswers('PLUMBING'),
  city: 'Москва',
  budgetMin: 2_000,
  budgetMax: 4_000,
};
const bidBody = { price: 3_000, durationDays: 1, comment: 'Заменю за час, свой инструмент.' };

type Actor = { auth: { Authorization: string }; id: string; email: string };

describe('Account export and deletion (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  let counter = 0;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  const clean = async () => {
    await prisma.auditLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.review.deleteMany();
    await prisma.jobMessage.deleteMany();
    await prisma.jobPlan.deleteMany();
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
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
  });

  /** Регистрация с известным email (для проверки входа после удаления). */
  async function register(role: 'CUSTOMER' | 'CONTRACTOR', email?: string): Promise<Actor> {
    counter += 1;
    const address = email ?? `del-${Date.now()}-${counter}@example.ru`;
    const res = await http()
      .post('/v1/auth/register')
      .send({ email: address, password: PASSWORD, name: `Человек ${counter}`, role })
      .expect(201);
    return {
      id: res.body.user.id,
      email: address,
      auth: { Authorization: `Bearer ${res.body.token}` },
    };
  }
  const login = (email: string) =>
    http().post('/v1/auth/login').send({ email, password: PASSWORD });
  const remove = (who: Actor, password = PASSWORD) =>
    http().post('/v1/me/delete').set(who.auth).send({ password });

  async function openJob(owner: Actor) {
    return (await http().post('/v1/me/jobs').set(owner.auth).send(jobBody).expect(201)).body
      .id as string;
  }
  async function bid(contractor: Actor, jobId: string) {
    return (
      await http().post(`/v1/jobs/${jobId}/bids`).set(contractor.auth).send(bidBody).expect(201)
    ).body.id as string;
  }
  async function accept(owner: Actor, jobId: string, bidId: string) {
    await http().post(`/v1/me/jobs/${jobId}/bids/${bidId}/accept`).set(owner.auth).expect(200);
  }

  describe('export', () => {
    it('needs a session', async () => {
      await http().get('/v1/me/export').expect(401);
    });

    it('returns own data as a file, without secrets and without other people', async () => {
      const customer = await register('CUSTOMER');
      const contractor = await register('CONTRACTOR');
      await http()
        .patch('/v1/me')
        .set(customer.auth)
        .send({ phone: '+7 900 123-45-67', city: 'Москва' })
        .expect(200);
      const jobId = await openJob(customer);
      await http().post('/v1/me/drafts').set(customer.auth).send({ title: 'Черновик' }).expect(201);
      await bid(contractor, jobId);

      const res = await http().get('/v1/me/export').set(customer.auth).expect(200);
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="garantych-/);
      expect(res.headers['cache-control']).toBe('no-store');
      const data = res.body as AccountExportDto;
      expect(data.account).toMatchObject({
        id: customer.id,
        email: customer.email,
        phone: '+79001234567',
        city: 'Москва',
        role: 'CUSTOMER',
      });
      expect(data.jobs.map((j) => j.id)).toEqual([jobId]);
      expect(data.jobs[0]).toMatchObject({ title: jobBody.title, bidsReceived: 1 });
      expect(data.drafts).toHaveLength(1);
      expect(data.sessions.length).toBeGreaterThan(0);
      const text = JSON.stringify(data);
      // Хеш пароля, токены сессий и данные мастера (кроме числа откликов) не выгружаются.
      expect(text).not.toMatch(/argon2|passwordHash|tokenHash/);
      expect(text).not.toContain(contractor.email);
      expect(text).not.toContain(contractor.id);
    });
  });

  describe('export of every section', () => {
    it('contractor: bids, messages, reviews, favorites, reports and bank logins; no customer data', async () => {
      const customer = await register('CUSTOMER');
      const contractor = await register('CONTRACTOR');
      const jobId = await openJob(customer);
      const bidId = await bid(contractor, jobId);
      await accept(customer, jobId, bidId);
      await http()
        .post(`/v1/jobs/${jobId}/messages`)
        .set(contractor.auth)
        .send({ body: 'Начинаю завтра в девять.' })
        .expect(200);
      await http()
        .post(`/v1/me/jobs/${jobId}/close`)
        .set(customer.auth)
        .send({ outcome: 'COMPLETED' })
        .expect(200);
      await http()
        .post(`/v1/me/jobs/${jobId}/review`)
        .set(customer.auth)
        .send({ rating: 5, text: 'Всё аккуратно.' })
        .expect(201);
      const other = await openJob(customer);
      await http().put(`/v1/me/favorites/${other}`).set(contractor.auth).expect(200);
      await http()
        .post('/v1/reports')
        .set(contractor.auth)
        .send({ targetType: 'JOB', targetId: other, reason: 'SPAM', comment: 'Похоже на рекламу' })
        .expect(201);
      await prisma.externalAccount.create({
        data: { provider: 'SBER', subject: `export-${contractor.id}`, userId: contractor.id },
      });

      const data = (await http().get('/v1/me/export').set(contractor.auth).expect(200))
        .body as AccountExportDto;
      expect(data.bids).toMatchObject([{ id: bidId, jobId, status: 'ACCEPTED' }]);
      expect(data.messages).toMatchObject([{ jobId, body: 'Начинаю завтра в девять.', photos: 0 }]);
      expect(data.reviewsReceived).toMatchObject([{ jobId, rating: 5, text: 'Всё аккуратно.' }]);
      expect(data.reviewsWritten).toEqual([]);
      expect(data.favorites).toMatchObject([{ jobId: other }]);
      expect(data.reports).toMatchObject([{ targetType: 'JOB', reason: 'SPAM' }]);
      expect(data.bankLogins).toMatchObject([{ provider: 'SBER' }]);
      // Отзыв о себе без автора, заказы заказчика — не выгрузка мастера.
      const text = JSON.stringify(data);
      expect(text).not.toContain(customer.id);
      expect(text).not.toContain(customer.email);
      expect(text).not.toContain(`export-${contractor.id}`);

      const written = (await http().get('/v1/me/export').set(customer.auth).expect(200))
        .body as AccountExportDto;
      expect(written.reviewsWritten).toMatchObject([{ jobId, rating: 5 }]);
    });
  });

  describe('delete', () => {
    it('needs a session and the current password', async () => {
      const customer = await register('CUSTOMER');
      await http().post('/v1/me/delete').send({ password: PASSWORD }).expect(401);
      await http().post('/v1/me/delete').set(customer.auth).send({}).expect(400);
      const wrong = await remove(customer, 'wrong-password-1').expect(400);
      expect(wrong.body.code).toBe('PASSWORD_INVALID');
      // Ничего не изменилось: вход работает.
      await login(customer.email).expect(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).deletedAt).toBe(
        null,
      );
    });

    it('refused while a job is in progress, for the customer and for the contractor', async () => {
      const customer = await register('CUSTOMER');
      const contractor = await register('CONTRACTOR');
      const jobId = await openJob(customer);
      await accept(customer, jobId, await bid(contractor, jobId));

      for (const who of [customer, contractor]) {
        const res = await remove(who).expect(409);
        expect(res.body.code).toBe('ACCOUNT_HAS_ACTIVE_DEALS');
      }
      await login(customer.email).expect(200);
      await login(contractor.email).expect(200);
    });

    it('customer: personal data erased, sessions ended, open jobs closed, email free again', async () => {
      const customer = await register('CUSTOMER');
      const contractor = await register('CONTRACTOR');
      await http()
        .patch('/v1/me')
        .set(customer.auth)
        .send({ phone: '+7 900 123-45-67', city: 'Москва' })
        .expect(200);
      const avatar = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#c2410c' },
      })
        .png()
        .toBuffer();
      await http()
        .put('/v1/me/avatar')
        .set(customer.auth)
        .attach('file', avatar, 'a.png')
        .expect(200);
      const second = await login(customer.email).expect(200);
      const jobId = await openJob(customer);
      const bidId = await bid(contractor, jobId);
      await http().post('/v1/me/drafts').set(customer.auth).send({ title: 'Черновик' }).expect(201);

      await remove(customer).expect(204);

      // Все сеансы завершены, войти нельзя.
      await http().get('/v1/me').set(customer.auth).expect(401);
      await http().get('/v1/me').set('Authorization', `Bearer ${second.body.token}`).expect(401);
      await login(customer.email).expect(401);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
      expect(row).toMatchObject({
        name: DELETED_NAME,
        phone: null,
        city: null,
        avatarUpdatedAt: null,
      });
      expect(row.email).not.toBe(customer.email);
      expect(row.email).toMatch(/@deleted\.invalid$/);
      expect(row.deletedAt).toBeInstanceOf(Date);
      expect(row.blockedAt).toBeInstanceOf(Date);
      expect(await prisma.session.count({ where: { userId: customer.id } })).toBe(0);
      expect(await prisma.jobDraft.count({ where: { ownerId: customer.id } })).toBe(0);
      expect(await prisma.userAvatar.count({ where: { userId: customer.id } })).toBe(0);

      // Открытый заказ отменён, отклик мастера отклонён, мастер узнал об этом.
      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      expect(job).toMatchObject({ status: 'CLOSED', closeOutcome: 'CANCELLED' });
      expect(await prisma.bid.findUniqueOrThrow({ where: { id: bidId } })).toMatchObject({
        status: 'REJECTED',
        rejectReason: 'JOB_CLOSED',
      });
      expect(
        await prisma.notification.count({ where: { userId: contractor.id, kind: 'BID_REJECTED' } }),
      ).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: { action: 'ACCOUNT_DELETED', entityId: customer.id },
        }),
      ).toBe(1);

      // Тот же адрес можно зарегистрировать заново — это новый аккаунт.
      const again = await register('CUSTOMER', customer.email);
      expect(again.id).not.toBe(customer.id);
    });

    it('contractor: pending bids withdrawn, public profile gone, finished deals stay for the customer', async () => {
      const customer = await register('CUSTOMER');
      const contractor = await register('CONTRACTOR');
      await http()
        .put('/v1/me/profile')
        .set(contractor.auth)
        .send({ about: 'Сантехник с опытом', categories: ['PLUMBING'], cities: ['Москва'] })
        .expect(200);
      // Завершённый заказ с перепиской.
      const doneJob = await openJob(customer);
      await accept(customer, doneJob, await bid(contractor, doneJob));
      await http()
        .post(`/v1/jobs/${doneJob}/messages`)
        .set(contractor.auth)
        .send({ body: 'Работу сделал, проверьте.' })
        .expect(200);
      await http()
        .post(`/v1/me/jobs/${doneJob}/close`)
        .set(customer.auth)
        .send({ outcome: 'COMPLETED' })
        .expect(200);
      // Отклик на рассмотрении.
      const openJobId = await openJob(customer);
      const pending = await bid(contractor, openJobId);
      const { publicId } = await prisma.user.findUniqueOrThrow({ where: { id: contractor.id } });

      await remove(contractor).expect(204);

      expect((await prisma.bid.findUniqueOrThrow({ where: { id: pending } })).status).toBe(
        'WITHDRAWN',
      );
      expect(await prisma.contractorProfile.count({ where: { userId: contractor.id } })).toBe(0);
      await http().get(`/v1/contractors/${publicId}`).expect(404);
      // Переписка завершённого заказа осталась у заказчика.
      const messages = await http()
        .get(`/v1/jobs/${doneJob}/messages`)
        .set(customer.auth)
        .expect(200);
      expect(messages.body.items.map((m: { body: string }) => m.body)).toContain(
        'Работу сделал, проверьте.',
      );
    });

    it('a deleted account cannot be unblocked or given a password reset link', async () => {
      const admin = await signUpAdmin(app, prisma);
      const customer = await register('CUSTOMER');
      await remove(customer).expect(204);
      const unblock = await http()
        .post(`/v1/admin/users/${customer.id}/blocked`)
        .set(admin.auth)
        .send({ blocked: false, reason: 'Ошибка' })
        .expect(409);
      expect(unblock.body.code).toBe('ACCOUNT_DELETED');
      const reset = await http()
        .post(`/v1/admin/users/${customer.id}/password-reset`)
        .set(admin.auth)
        .expect(409);
      expect(reset.body.code).toBe('ACCOUNT_DELETED');
    });

    it('two deletions at once: one succeeds, the other is refused by the ended session', async () => {
      const customer = await register('CUSTOMER');
      const results = await Promise.all([remove(customer), remove(customer)]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([204, 401]);
      expect(
        await prisma.auditLog.count({
          where: { action: 'ACCOUNT_DELETED', entityId: customer.id },
        }),
      ).toBe(1);
    });
  });

  it('other users are not affected', async () => {
    const a = await signUp(app, 'CUSTOMER');
    const b = await register('CUSTOMER');
    await remove(b).expect(204);
    await http().get('/v1/me').set(a.auth).expect(200);
  });
});
