import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp, signUpAdmin } from './helpers';

const prisma = new PrismaClient();
const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'brand-new-password-2';
const jobBody = {
  title: 'Замена проводки в квартире',
  description: 'Две комнаты и кухня, штробы, новые розетки, щиток на месте.',
  category: 'OTHER',
  details: requiredAnswers('OTHER'),
  city: 'Москва',
};
const bidBody = { price: 80_000, durationDays: 10, comment: 'Сделаю за десять дней, допуск есть.' };

type Auth = Awaited<ReturnType<typeof signUp>>;

describe('Accounts and trust (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  const clean = async () => {
    await prisma.auditLog.deleteMany();
    await prisma.report.deleteMany();
    await prisma.notification.deleteMany();
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

  const email = async (who: Auth) =>
    (await prisma.user.findUniqueOrThrow({ where: { id: who.id } })).email;
  const issue = (admin: Auth, userId: string) =>
    http().post(`/v1/admin/users/${userId}/password-reset`).set(admin.auth);
  const reset = (token: string, password = NEW_PASSWORD) =>
    http().post('/v1/auth/password-reset').send({ token, password });

  async function completedDeal(customer: Auth, contractor: Auth, bid = bidBody) {
    const { body: job } = await http().post('/v1/me/jobs').set(customer.auth).send(jobBody);
    const { body: placed } = await http()
      .post(`/v1/jobs/${job.id}/bids`)
      .set(contractor.auth)
      .send(bid)
      .expect(201);
    await http()
      .post(`/v1/me/jobs/${job.id}/bids/${placed.id}/accept`)
      .set(customer.auth)
      .expect(200);
    await http()
      .post(`/v1/me/jobs/${job.id}/close`)
      .set(customer.auth)
      .send({ outcome: 'COMPLETED' })
      .expect(200);
    return { jobId: job.id as string, bidId: placed.id as string };
  }

  describe('password reset', () => {
    it('a link works once, ends every session and signs in with the new password', async () => {
      const admin = await signUpAdmin(app, prisma);
      const user = await signUp(app, 'CUSTOMER');
      const { body: link } = await issue(admin, user.id).expect(201);
      expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = await prisma.passwordReset.findFirstOrThrow({ where: { userId: user.id } });
      expect(stored.tokenHash).not.toContain(link.token);

      const res = await reset(link.token).expect(200);
      expect(res.body.user.id).toBe(user.id);
      await http().get('/v1/me').set(user.auth).expect(401);
      await http()
        .get('/v1/me')
        .set({ Authorization: `Bearer ${res.body.token}` })
        .expect(200);
      await http()
        .post('/v1/auth/login')
        .send({ email: await email(user), password: PASSWORD })
        .expect(401);
      await http()
        .post('/v1/auth/login')
        .send({ email: await email(user), password: NEW_PASSWORD })
        .expect(200);
      await reset(link.token, 'another-password-3').expect(400);
      expect(
        await prisma.auditLog.count({
          where: {
            entityId: user.id,
            action: { in: ['PASSWORD_RESET_ISSUED', 'PASSWORD_RESET_DONE'] },
          },
        }),
      ).toBe(2);
    });

    it('a new link cancels the old one; expired, malformed and unknown links are refused', async () => {
      const admin = await signUpAdmin(app, prisma);
      const user = await signUp(app, 'CONTRACTOR');
      const { body: first } = await issue(admin, user.id).expect(201);
      const { body: second } = await issue(admin, user.id).expect(201);
      await reset(first.token).expect(400);
      await prisma.passwordReset.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 5000) },
      });
      const expired = await reset(second.token).expect(400);
      expect(expired.body.message).toMatch(/недействительна/);
      await reset('short').expect(400);
      await reset('A'.repeat(43)).expect(400);
      await reset(first.token, '123').expect(400);
    });

    it('refuses a password equal to the email and a blocked account', async () => {
      const admin = await signUpAdmin(app, prisma);
      const user = await signUp(app, 'CUSTOMER');
      const { body: link } = await issue(admin, user.id).expect(201);
      await reset(link.token, await email(user)).expect(400);
      await prisma.user.update({ where: { id: user.id }, data: { blockedAt: new Date() } });
      await reset(link.token).expect(403);
      await issue(admin, user.id).expect(409);
    });

    it('two simultaneous requests with one link change the password once', async () => {
      const admin = await signUpAdmin(app, prisma);
      const user = await signUp(app, 'CUSTOMER');
      const { body: link } = await issue(admin, user.id).expect(201);
      const results = await Promise.all([
        reset(link.token, 'first-parallel-pass'),
        reset(link.token, 'second-parallel-pass'),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    });

    it('only an admin issues links', async () => {
      const user = await signUp(app, 'CUSTOMER');
      await issue(user, user.id).expect(403);
    });
  });

  describe('blocking in the database', () => {
    it('no new session for a blocked account, whatever writes it (old API after a rollback)', async () => {
      const user = await signUp(app, 'CUSTOMER');
      await prisma.user.update({ where: { id: user.id }, data: { blockedAt: new Date() } });
      await expect(
        prisma.session.create({
          data: {
            userId: user.id,
            tokenHash: 'f'.repeat(64),
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
      ).rejects.toThrow(/blocked/);
      await prisma.user.update({ where: { id: user.id }, data: { blockedAt: null } });
      await http()
        .post('/v1/auth/login')
        .send({ email: await email(user), password: PASSWORD })
        .expect(200);
    });
  });

  describe('admin users', () => {
    it('finds people by email, name or account number and counts open complaints', async () => {
      const admin = await signUpAdmin(app, prisma);
      const owner = await signUp(app, 'CUSTOMER');
      const reporter = await signUp(app, 'CONTRACTOR');
      const { body: job } = await http().post('/v1/me/jobs').set(owner.auth).send(jobBody);
      await http()
        .post('/v1/reports')
        .set(reporter.auth)
        .send({ targetType: 'JOB', targetId: job.id, reason: 'FAKE' })
        .expect(201);
      const ownerRow = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
      for (const q of [ownerRow.email.toUpperCase(), ownerRow.name, String(ownerRow.publicId)]) {
        const { body } = await http()
          .get(`/v1/admin/users?q=${encodeURIComponent(q)}`)
          .set(admin.auth)
          .expect(200);
        expect(body.items).toEqual([
          expect.objectContaining({
            id: owner.id,
            jobs: 1,
            bids: 0,
            openReports: 1,
            blocked: false,
          }),
        ]);
      }
      const { body: all } = await http().get('/v1/admin/users').set(admin.auth).expect(200);
      expect(all.total).toBe(3);
    });
  });

  describe('reviews and rating', () => {
    it('a review only after closing as done, once; rating shows on bids and the public card', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      // Отменённый заказ — без отзыва.
      const { body: cancelled } = await http().post('/v1/me/jobs').set(customer.auth).send(jobBody);
      await http()
        .post(`/v1/me/jobs/${cancelled.id}/close`)
        .set(customer.auth)
        .send({ outcome: 'CANCELLED' })
        .expect(200);
      await http()
        .post(`/v1/me/jobs/${cancelled.id}/review`)
        .set(customer.auth)
        .send({ rating: 5 })
        .expect(409);

      const { jobId } = await completedDeal(customer, contractor);
      const state = await http().get(`/v1/me/jobs/${jobId}/review`).set(customer.auth).expect(200);
      expect(state.body).toMatchObject({ canReview: true, review: null });
      await http()
        .post(`/v1/me/jobs/${jobId}/review`)
        .set(customer.auth)
        .send({ rating: 4, text: 'Хорошо, но задержался на день.' })
        .expect(201);
      const after = await http().get(`/v1/me/jobs/${jobId}/review`).set(customer.auth).expect(200);
      expect(after.body).toMatchObject({ canReview: false, review: { rating: 4 } });

      const second = await completedDeal(customer, contractor);
      await http()
        .post(`/v1/me/jobs/${second.jobId}/review`)
        .set(customer.auth)
        .send({ rating: 5 })
        .expect(201);

      const { publicId } = await prisma.user.findUniqueOrThrow({ where: { id: contractor.id } });
      const card = await http().get(`/v1/contractors/${publicId}`).expect(200);
      expect(card.body).toMatchObject({
        rating: { average: 4.5, count: 2 },
        completedJobs: 2,
        hasMoreReviews: false,
      });
      expect(JSON.stringify(card.body)).not.toContain('@');

      // Отклик этого мастера к новому заказу: заказчик видит рейтинг.
      const { body: next } = await http().post('/v1/me/jobs').set(customer.auth).send(jobBody);
      await http().post(`/v1/jobs/${next.id}/bids`).set(contractor.auth).send(bidBody).expect(201);
      const bids = await http().get(`/v1/me/jobs/${next.id}/bids`).set(customer.auth).expect(200);
      expect(bids.body[0].contractor).toMatchObject({
        publicId,
        rating: { average: 4.5, count: 2 },
      });

      // Скрытый модератором отзыв не считается.
      const admin = await signUpAdmin(app, prisma);
      const hidden = await prisma.review.findFirstOrThrow({ where: { rating: 4 } });
      await http()
        .post(`/v1/admin/reviews/${hidden.id}/hidden`)
        .set(admin.auth)
        .send({ hidden: true, reason: 'Проверка скрытия отзыва' })
        .expect(200);
      const recount = await http().get(`/v1/contractors/${publicId}`).expect(200);
      expect(recount.body.rating).toEqual({ average: 5, count: 1 });
    });

    it('two simultaneous reviews of one job: exactly one is saved', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const { jobId } = await completedDeal(customer, contractor);
      const results = await Promise.all(
        [5, 3].map((rating) =>
          http().post(`/v1/me/jobs/${jobId}/review`).set(customer.auth).send({ rating }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.review.count({ where: { jobId } })).toBe(1);
    });

    it('a stranger cannot review someone else’s job; customers and blocked people have no card', async () => {
      const customer = await signUp(app, 'CUSTOMER');
      const stranger = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const { jobId } = await completedDeal(customer, contractor);
      await http()
        .post(`/v1/me/jobs/${jobId}/review`)
        .set(stranger.auth)
        .send({ rating: 1 })
        .expect(404);
      const { publicId: customerNo } = await prisma.user.findUniqueOrThrow({
        where: { id: customer.id },
      });
      await http().get(`/v1/contractors/${customerNo}`).expect(404);
      const { publicId } = await prisma.user.update({
        where: { id: contractor.id },
        data: { blockedAt: new Date() },
      });
      await http().get(`/v1/contractors/${publicId}`).expect(404);
      await http().get('/v1/contractors/99999999999').expect(404);
      await http().get('/v1/contractors/abc').expect(404);
    });
  });

  describe('favorites', () => {
    it('adds once, lists newest first, hides jobs hidden by a moderator, isolated per person', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const other = await signUp(app, 'CONTRACTOR');
      const ids: string[] = [];
      for (let i = 0; i < 2; i += 1) {
        const { body } = await http().post('/v1/me/jobs').set(owner.auth).send(jobBody);
        ids.push(body.id);
        await http().put(`/v1/me/favorites/${body.id}`).set(contractor.auth).expect(200);
      }
      await http().put(`/v1/me/favorites/${ids[0]}`).set(contractor.auth).expect(200);
      const list = await http().get('/v1/me/favorites').set(contractor.auth).expect(200);
      expect(list.body.total).toBe(2);
      const theirs = await http().get('/v1/me/favorites/ids').set(other.auth).expect(200);
      expect(theirs.body.jobIds).toEqual([]);

      await prisma.job.update({ where: { id: ids[1] }, data: { hiddenAt: new Date() } });
      const visible = await http().get('/v1/me/favorites/ids').set(contractor.auth).expect(200);
      expect(visible.body.jobIds).toEqual([ids[0]]);
      await http().put(`/v1/me/favorites/${ids[1]}`).set(other.auth).expect(404);

      await http().delete(`/v1/me/favorites/${ids[0]}`).set(contractor.auth).expect(200);
      await http().delete(`/v1/me/favorites/${ids[0]}`).set(contractor.auth).expect(200);
      const empty = await http().get('/v1/me/favorites/ids').set(contractor.auth).expect(200);
      expect(empty.body.jobIds).toEqual([]);
    });
  });

  describe('contact flags', () => {
    it('a message or bid with contacts is flagged for the moderator; ordinary text is not', async () => {
      const admin = await signUpAdmin(app, prisma);
      const customer = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const { body: job } = await http().post('/v1/me/jobs').set(customer.auth).send(jobBody);
      const { body: placed } = await http()
        .post(`/v1/jobs/${job.id}/bids`)
        .set(contractor.auth)
        .send({ ...bidBody, comment: 'Пишите в телеграм @master_remont, обсудим.' })
        .expect(201);
      await http()
        .post(`/v1/me/jobs/${job.id}/bids/${placed.id}/accept`)
        .set(customer.auth)
        .expect(200);
      await http()
        .post(`/v1/jobs/${job.id}/messages`)
        .set(customer.auth)
        .send({ body: 'Площадь 54 м², бюджет 180 000 ₽, начать 15.11.' })
        .expect(200);
      const { body: chat } = await http()
        .post(`/v1/jobs/${job.id}/messages`)
        .set(contractor.auth)
        .send({ body: 'Мой номер 8 (912) 345-67-89, почта master@mail.ru' })
        .expect(200);
      const { body: flags } = await http().get('/v1/admin/flags').set(admin.auth).expect(200);
      expect(flags.total).toBe(2);
      const byTarget = Object.fromEntries(
        flags.items.map((f: { targetId: string; kinds: string[] }) => [f.targetId, f.kinds]),
      );
      expect(byTarget[placed.id]).toEqual(['MESSENGER']);
      const messageId = chat.items.at(-1).id;
      expect(byTarget[messageId]).toEqual(['PHONE', 'EMAIL']);
    });
  });

  describe('my reports', () => {
    it('the reporter sees the decision and it counts in the bell until opened', async () => {
      const admin = await signUpAdmin(app, prisma);
      const owner = await signUp(app, 'CUSTOMER');
      const reporter = await signUp(app, 'CONTRACTOR');
      const { body: job } = await http().post('/v1/me/jobs').set(owner.auth).send(jobBody);
      const { body: filed } = await http()
        .post('/v1/reports')
        .set(reporter.auth)
        .send({ targetType: 'JOB', targetId: job.id, reason: 'SPAM' })
        .expect(201);
      const summary = () =>
        http().get('/v1/me/notifications/summary').set(reporter.auth).expect(200);
      expect((await summary()).body.reportDecisions).toBe(0);
      await http()
        .post(`/v1/admin/reports/${filed.id}/resolve`)
        .set(admin.auth)
        .send({ status: 'RESOLVED', note: 'Заказ скрыт' })
        .expect(200);
      expect((await summary()).body.reportDecisions).toBe(1);
      const { body: mine } = await http().get('/v1/reports/mine').set(reporter.auth).expect(200);
      expect(mine.items[0]).toMatchObject({
        status: 'RESOLVED',
        note: 'Заказ скрыт',
        unseen: true,
      });
      await http().post('/v1/reports/mine/seen').set(reporter.auth).expect(204);
      expect((await summary()).body.reportDecisions).toBe(0);
      const { body: other } = await http().get('/v1/reports/mine').set(owner.auth).expect(200);
      expect(other.total).toBe(0);
    });
  });
});
