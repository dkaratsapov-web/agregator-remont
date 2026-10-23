import { REPORT_LIMITS } from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp, signUpAdmin } from './helpers';

const prisma = new PrismaClient();

const jobBody = {
  title: 'Укладка плитки в ванной',
  description: 'Пол и стены, около 12 м², плитка куплена заказчиком.',
  category: 'OTHER',
  details: requiredAnswers('OTHER'),
  city: 'Москва',
};
const bidBody = { price: 60_000, durationDays: 7, comment: 'Сделаю за неделю, инструмент свой.' };
const PASSWORD = 'correct-horse-battery';

type Auth = Awaited<ReturnType<typeof signUp>>;

describe('Moderation (e2e)', () => {
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

  async function openJob(owner: Auth) {
    const { body } = await http().post('/v1/me/jobs').set(owner.auth).send(jobBody).expect(201);
    return body.id as string;
  }
  async function bid(contractor: Auth, jobId: string) {
    const { body } = await http()
      .post(`/v1/jobs/${jobId}/bids`)
      .set(contractor.auth)
      .send(bidBody)
      .expect(201);
    return body.id as string;
  }
  /** Заказ в работе и сообщение исполнителя. */
  async function deal() {
    const owner = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');
    const jobId = await openJob(owner);
    const bidId = await bid(contractor, jobId);
    await http().post(`/v1/me/jobs/${jobId}/bids/${bidId}/accept`).set(owner.auth).expect(200);
    const photo = await sharp({
      create: { width: 64, height: 48, channels: 3, background: '#c2410c' },
    })
      .jpeg()
      .toBuffer();
    const { body } = await http()
      .post(`/v1/jobs/${jobId}/messages`)
      .set(contractor.auth)
      .field('body', 'Переведите предоплату на карту')
      .attach('photos', photo, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(200);
    const message = body.items[0];
    return { owner, contractor, jobId, bidId, messageId: message.id as string, message };
  }
  const report = (who: Auth, body: object) => http().post('/v1/reports').set(who.auth).send(body);

  describe('reports', () => {
    it('anyone signed in may report a job in the catalog, but not their own', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const stranger = await signUp(app, 'CONTRACTOR');
      const jobId = await openJob(owner);
      const res = await report(stranger, { targetType: 'JOB', targetId: jobId, reason: 'FAKE' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: expect.any(String), duplicate: false });
      await report(owner, { targetType: 'JOB', targetId: jobId, reason: 'SPAM' }).expect(400);
      await report(stranger, { targetType: 'JOB', targetId: 'missing', reason: 'SPAM' }).expect(
        404,
      );
      await http()
        .post('/v1/reports')
        .send({ targetType: 'JOB', targetId: jobId, reason: 'SPAM' })
        .expect(401);
      const stored = await prisma.report.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored).toMatchObject({ jobId, status: 'OPEN', reporterId: stranger.id });
      expect(
        await prisma.auditLog.count({ where: { action: 'REPORT_CREATED', entityId: res.body.id } }),
      ).toBe(1);
    });

    it('a repeated report while the first is open is the same report; OTHER needs a comment', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const stranger = await signUp(app, 'CONTRACTOR');
      const jobId = await openJob(owner);
      const first = await report(stranger, { targetType: 'JOB', targetId: jobId, reason: 'FAKE' });
      const again = await report(stranger, { targetType: 'JOB', targetId: jobId, reason: 'SPAM' });
      expect(again.status).toBe(201);
      expect(again.body).toEqual({ id: first.body.id, duplicate: true });
      await report(stranger, { targetType: 'JOB', targetId: jobId, reason: 'OTHER' }).expect(400);
      await report(stranger, {
        targetType: 'JOB',
        targetId: jobId,
        reason: 'OTHER',
        comment: 'x'.repeat(REPORT_LIMITS.COMMENT_MAX + 1),
      }).expect(400);
      expect(await prisma.report.count()).toBe(1);
    });

    it('messages: only the other side of the current deal may report them', async () => {
      const d = await deal();
      const stranger = await signUp(app, 'CUSTOMER');
      await report(d.owner, {
        targetType: 'MESSAGE',
        targetId: d.messageId,
        reason: 'FRAUD',
      }).expect(201);
      await report(d.contractor, {
        targetType: 'MESSAGE',
        targetId: d.messageId,
        reason: 'FRAUD',
      }).expect(400);
      await report(stranger, {
        targetType: 'MESSAGE',
        targetId: d.messageId,
        reason: 'FRAUD',
      }).expect(404);
    });

    it('bids: only the owner of the job may report them', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const stranger = await signUp(app, 'CUSTOMER');
      const jobId = await openJob(owner);
      const bidId = await bid(contractor, jobId);
      await report(stranger, { targetType: 'BID', targetId: bidId, reason: 'SPAM' }).expect(404);
      await report(contractor, { targetType: 'BID', targetId: bidId, reason: 'SPAM' }).expect(404);
      await report(owner, { targetType: 'BID', targetId: bidId, reason: 'SPAM' }).expect(201);
    });

    it('limits reports per day', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const reporter = await signUp(app, 'CONTRACTOR');
      const jobId = await openJob(owner);
      await prisma.report.createMany({
        data: Array.from({ length: REPORT_LIMITS.PER_DAY }, (_, i) => ({
          reporterId: reporter.id,
          targetType: 'JOB' as const,
          targetId: `other-${i}`,
          jobId,
          reason: 'SPAM' as const,
        })),
      });
      await report(reporter, { targetType: 'JOB', targetId: jobId, reason: 'SPAM' }).expect(429);
    });
  });

  describe('admin queue', () => {
    it('lists open reports oldest first with what was reported and by whom; resolving closes them', async () => {
      const d = await deal();
      const admin = await signUpAdmin(app, prisma);
      const stranger = await signUp(app, 'CONTRACTOR');
      const onJob = await report(stranger, {
        targetType: 'JOB',
        targetId: d.jobId,
        reason: 'FAKE',
      });
      const onMessage = await report(d.owner, {
        targetType: 'MESSAGE',
        targetId: d.messageId,
        reason: 'FRAUD',
        comment: 'Просит предоплату на карту',
      });
      const { body } = await http().get('/v1/admin/reports').set(admin.auth).expect(200);
      expect(body.total).toBe(2);
      expect(body.items.map((r: { id: string }) => r.id)).toEqual([
        onJob.body.id,
        onMessage.body.id,
      ]);
      expect(body.items[1]).toMatchObject({
        targetType: 'MESSAGE',
        reason: 'FRAUD',
        comment: 'Просит предоплату на карту',
        status: 'OPEN',
        note: null,
        resolvedAt: null,
        subject: {
          jobId: d.jobId,
          jobTitle: jobBody.title,
          excerpt: 'Переведите предоплату на карту',
          hidden: false,
          author: { id: d.contractor.id, blocked: false },
        },
      });
      expect(body.items[0].subject.author.id).toBe(d.owner.id);

      const resolved = await http()
        .post(`/v1/admin/reports/${onMessage.body.id}/resolve`)
        .set(admin.auth)
        .send({ status: 'RESOLVED', note: 'Сообщение скрыто, исполнитель заблокирован' })
        .expect(200);
      expect(resolved.body).toMatchObject({ status: 'RESOLVED', resolvedAt: expect.any(String) });
      const open = await http().get('/v1/admin/reports').set(admin.auth).expect(200);
      expect(open.body.items.map((r: { id: string }) => r.id)).toEqual([onJob.body.id]);
      const done = await http()
        .get('/v1/admin/reports?status=RESOLVED')
        .set(admin.auth)
        .expect(200);
      expect(done.body.items).toHaveLength(1);
      // После разбора можно пожаловаться снова: это новая жалоба.
      const again = await report(d.owner, {
        targetType: 'MESSAGE',
        targetId: d.messageId,
        reason: 'ABUSE',
      });
      expect(again.body.duplicate).toBe(false);
      // Не администратору очередь недоступна.
      await http().get('/v1/admin/reports').set(d.owner.auth).expect(403);
    });
  });

  describe('hiding', () => {
    it('a hidden job leaves the catalog and closes to bids; the deal and the owner keep it', async () => {
      const d = await deal();
      const admin = await signUpAdmin(app, prisma);
      const newcomer = await signUp(app, 'CONTRACTOR');
      const hide = (hidden: boolean) =>
        http()
          .post(`/v1/admin/jobs/${d.jobId}/hidden`)
          .set(admin.auth)
          .send({ hidden, reason: 'Ненастоящий заказ' });
      expect((await hide(true).expect(200)).body).toEqual({ id: d.jobId, hidden: true });
      await hide(true).expect(200); // повтор — без новой записи в журнале
      const catalog = await http().get('/v1/jobs?limit=50').expect(200);
      expect(catalog.body.items.map((j: { id: string }) => j.id)).not.toContain(d.jobId);
      await http().get(`/v1/jobs/${d.jobId}`).expect(404);
      await http().post(`/v1/jobs/${d.jobId}/bids`).set(newcomer.auth).send(bidBody).expect(404);
      const own = await http().get(`/v1/me/jobs/${d.jobId}`).set(d.owner.auth).expect(200);
      expect(own.body.hidden).toBe(true);
      // Сделка продолжается: переписка работает.
      await http()
        .post(`/v1/jobs/${d.jobId}/messages`)
        .set(d.owner.auth)
        .send({ body: 'Работаем дальше' })
        .expect(200);
      await report(newcomer, { targetType: 'JOB', targetId: d.jobId, reason: 'SPAM' }).expect(404);

      await hide(false).expect(200);
      await http().get(`/v1/jobs/${d.jobId}`).expect(200);
      const audit = await prisma.auditLog.findMany({
        where: {
          entityType: 'job',
          entityId: d.jobId,
          action: { in: ['CONTENT_HIDDEN', 'CONTENT_RESTORED'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((a) => a.action)).toEqual(['CONTENT_HIDDEN', 'CONTENT_RESTORED']);
      expect(audit[0].changes).toMatchObject({ reason: { to: 'Ненастоящий заказ' } });
    });

    it('a hidden message keeps its place without text and photos; its photos close to the sides', async () => {
      const d = await deal();
      const admin = await signUpAdmin(app, prisma);
      const photoId = d.message.photos[0].id as string;
      await http()
        .post(`/v1/admin/messages/${d.messageId}/hidden`)
        .set(admin.auth)
        .send({ hidden: true, reason: 'Просьба о предоплате' })
        .expect(200);
      for (const who of [d.owner, d.contractor]) {
        const { body } = await http().get(`/v1/jobs/${d.jobId}/messages`).set(who.auth).expect(200);
        expect(body.items[0]).toMatchObject({
          id: d.messageId,
          hidden: true,
          body: '',
          photos: [],
        });
        await http().get(`/v1/jobs/${d.jobId}/photos/${photoId}`).set(who.auth).expect(404);
      }
      await http().get(`/v1/jobs/${d.jobId}/photos/${photoId}`).set(admin.auth).expect(200);
      await report(d.owner, {
        targetType: 'MESSAGE',
        targetId: d.messageId,
        reason: 'FRAUD',
      }).expect(404);
    });

    it('a hidden bid disappears for the owner and cannot be chosen; the chosen bid cannot be hidden', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const spammer = await signUp(app, 'CONTRACTOR');
      const good = await signUp(app, 'CONTRACTOR');
      const admin = await signUpAdmin(app, prisma);
      const jobId = await openJob(owner);
      const spamBid = await bid(spammer, jobId);
      const goodBid = await bid(good, jobId);
      await http()
        .post(`/v1/admin/bids/${spamBid}/hidden`)
        .set(admin.auth)
        .send({ hidden: true, reason: 'Реклама в отклике' })
        .expect(200);
      const { body } = await http().get(`/v1/me/jobs/${jobId}/bids`).set(owner.auth).expect(200);
      expect(body.items.map((b: { id: string }) => b.id)).toEqual([goodBid]);
      await http().post(`/v1/me/jobs/${jobId}/bids/${spamBid}/accept`).set(owner.auth).expect(404);
      await http().post(`/v1/me/jobs/${jobId}/bids/${goodBid}/accept`).set(owner.auth).expect(200);
      await http()
        .post(`/v1/admin/bids/${goodBid}/hidden`)
        .set(admin.auth)
        .send({ hidden: true, reason: 'Попытка скрыть выбранный' })
        .expect(409);
    });
  });

  describe('blocking', () => {
    it('a blocked user is signed out everywhere and cannot sign in; unblocking lets them back', async () => {
      const user = await signUp(app, 'CONTRACTOR');
      const admin = await signUpAdmin(app, prisma);
      const email = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email;
      const block = (blocked: boolean) =>
        http()
          .post(`/v1/admin/users/${user.id}/blocked`)
          .set(admin.auth)
          .send({ blocked, reason: 'Мошенничество с предоплатой' });
      expect((await block(true).expect(200)).body).toEqual({ id: user.id, blocked: true });
      await http().get('/v1/me').set(user.auth).expect(401);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
      // О блокировке сообщается только после верного пароля.
      await http().post('/v1/auth/login').send({ email, password: 'wrong-password-1' }).expect(401);
      const denied = await http().post('/v1/auth/login').send({ email, password: PASSWORD });
      expect(denied.status).toBe(403);
      expect(denied.body.message).toMatch(/заблокирован/);

      await block(true).expect(200); // повтор — без изменений
      await block(false).expect(200);
      await http().post('/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
      const audit = await prisma.auditLog.findMany({
        where: { entityType: 'user', entityId: user.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((a) => a.action)).toEqual(['USER_BLOCKED', 'USER_UNBLOCKED']);
      expect(audit[0].changes).toMatchObject({ sessionsRevoked: { to: 1 } });
    });

    it('a session that survived a race is refused once the account is blocked', async () => {
      const user = await signUp(app, 'CUSTOMER');
      await prisma.user.update({ where: { id: user.id }, data: { blockedAt: new Date() } });
      await http().get('/v1/me').set(user.auth).expect(401);
    });

    it('admins cannot be blocked; only admins moderate', async () => {
      const admin = await signUpAdmin(app, prisma);
      const other = await signUpAdmin(app, prisma);
      const customer = await signUp(app, 'CUSTOMER');
      await http()
        .post(`/v1/admin/users/${other.id}/blocked`)
        .set(admin.auth)
        .send({ blocked: true, reason: 'Проверка запрета' })
        .expect(409);
      await http()
        .post(`/v1/admin/users/${admin.id}/blocked`)
        .set(customer.auth)
        .send({ blocked: true, reason: 'Проверка запрета' })
        .expect(403);
    });
  });
});
