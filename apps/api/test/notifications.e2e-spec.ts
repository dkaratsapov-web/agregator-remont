import { NOTIFICATION_LIMITS } from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp } from './helpers';

const prisma = new PrismaClient();

const jobBody = {
  title: 'Ремонт ванной комнаты',
  description: 'Плитка, сантехника, свет. Материалы покупает заказчик.',
  category: 'OTHER',
  details: requiredAnswers('OTHER'),
  city: 'Москва',
};
const bidBody = { price: 90_000, durationDays: 12, comment: 'Сделаю за двенадцать дней.' };

type Auth = Awaited<ReturnType<typeof signUp>>;

describe('Notifications (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  const clean = async () => {
    await prisma.auditLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.jobMessage.deleteMany();
    await prisma.jobPlan.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany();
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

  const list = (who: Auth, query = '') =>
    http().get(`/v1/me/notifications${query}`).set(who.auth).expect(200);
  const summary = (who: Auth) =>
    http().get('/v1/me/notifications/summary').set(who.auth).expect(200);
  const kinds = async (who: Auth) =>
    (await list(who)).body.items.map((n: { kind: string }) => n.kind) as string[];

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
  const accept = (owner: Auth, jobId: string, bidId: string) =>
    http().post(`/v1/me/jobs/${jobId}/bids/${bidId}/accept`).set(owner.auth).expect(200);

  /** Заказ в работе с согласованным планом из двух этапов. */
  async function dealWithPlan() {
    const owner = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');
    const jobId = await openJob(owner);
    await accept(owner, jobId, await bid(contractor, jobId));
    const base = `/v1/jobs/${jobId}`;
    const draft = await http()
      .put(`${base}/plan`)
      .set(contractor.auth)
      .send({
        version: 0,
        sequential: true,
        stages: [
          { title: 'Демонтаж', description: '', durationDays: 2 },
          { title: 'Плитка', description: '', durationDays: 5 },
        ],
      })
      .expect(200);
    const proposed = await http()
      .post(`${base}/plan/propose`)
      .set(contractor.auth)
      .send({ version: draft.body.version })
      .expect(200);
    const approved = await http()
      .post(`${base}/plan/approve`)
      .set(owner.auth)
      .send({ version: proposed.body.version })
      .expect(200);
    const stages = approved.body.stages as { id: string; title: string }[];
    return { owner, contractor, jobId, base, stages };
  }

  describe('events', () => {
    it('bids: the owner learns about new and withdrawn bids, contractors about the choice', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const chosen = await signUp(app, 'CONTRACTOR');
      const other = await signUp(app, 'CONTRACTOR');
      const leaving = await signUp(app, 'CONTRACTOR');
      const jobId = await openJob(owner);
      const chosenBid = await bid(chosen, jobId);
      await bid(other, jobId);
      const leavingBid = await bid(leaving, jobId);
      await http().post(`/v1/me/bids/${leavingBid}/withdraw`).set(leaving.auth).expect(200);
      await accept(owner, jobId, chosenBid);

      const ownerList = (await list(owner)).body;
      expect(ownerList.items.map((n: { kind: string }) => n.kind)).toEqual([
        'BID_WITHDRAWN',
        'BID_RECEIVED',
        'BID_RECEIVED',
        'BID_RECEIVED',
      ]);
      expect(ownerList.unread).toBe(4);
      expect(ownerList.items[1]).toMatchObject({
        jobId,
        jobTitle: jobBody.title,
        party: 'OWNER',
        count: 1,
        read: false,
        data: { price: bidBody.price, durationDays: bidBody.durationDays },
      });

      expect(await kinds(chosen)).toEqual(['BID_ACCEPTED']);
      const rejected = (await list(other)).body.items;
      expect(rejected).toEqual([
        expect.objectContaining({
          kind: 'BID_REJECTED',
          party: 'CONTRACTOR',
          data: { reason: 'OTHER_ACCEPTED' },
        }),
      ]);
      // Отозвавший сам себе не пишет; действующий никогда не получает своё событие.
      expect(await kinds(leaving)).toEqual([]);
    });

    it('closing an open job tells pending bidders; closing a job in progress tells the contractor', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const pending = await signUp(app, 'CONTRACTOR');
      const openId = await openJob(owner);
      await bid(pending, openId);
      await http().post(`/v1/me/jobs/${openId}/close`).set(owner.auth).send({}).expect(200);
      expect((await list(pending)).body.items[0]).toMatchObject({
        kind: 'BID_REJECTED',
        data: { reason: 'JOB_CLOSED' },
      });

      const d = await dealWithPlan();
      await http()
        .post(`/v1/me/jobs/${d.jobId}/close`)
        .set(d.owner.auth)
        .send({ outcome: 'COMPLETED' })
        .expect(200);
      expect((await list(d.contractor)).body.items[0]).toMatchObject({
        kind: 'JOB_CLOSED',
        data: { outcome: 'COMPLETED' },
      });
    });

    it('plan and stages: each step reaches the other party, replays add nothing', async () => {
      const d = await dealWithPlan();
      expect(await kinds(d.owner)).toEqual(['PLAN_PROPOSED', 'BID_RECEIVED']);
      expect(await kinds(d.contractor)).toEqual(['PLAN_APPROVED', 'BID_ACCEPTED']);

      const [first] = d.stages;
      const submit = () =>
        http()
          .post(`${d.base}/stages/${first.id}/submit`)
          .set(d.contractor.auth)
          .send({ comment: 'Демонтаж закончен' })
          .expect(200);
      await submit();
      await submit(); // повтор той же сдачи
      await http()
        .post(`${d.base}/stages/${first.id}/rework`)
        .set(d.owner.auth)
        .send({ comment: 'Остался мусор в углу' })
        .expect(200);
      await http()
        .post(`${d.base}/stages/${first.id}/submit`)
        .set(d.contractor.auth)
        .send({ comment: 'Мусор вынесен' })
        .expect(200);
      await http().post(`${d.base}/stages/${first.id}/accept`).set(d.owner.auth).expect(200);
      await http().post(`${d.base}/stages/${first.id}/accept`).set(d.owner.auth).expect(200);

      const owner = (await list(d.owner)).body.items;
      expect(owner.map((n: { kind: string }) => n.kind)).toEqual([
        'STAGE_SUBMITTED',
        'STAGE_SUBMITTED',
        'PLAN_PROPOSED',
        'BID_RECEIVED',
      ]);
      expect(owner[0].data).toEqual({ stageTitle: 'Демонтаж' });
      expect(await kinds(d.contractor)).toEqual([
        'STAGE_ACCEPTED',
        'STAGE_REWORK',
        'PLAN_APPROVED',
        'BID_ACCEPTED',
      ]);
    });

    it('returned plan and author change reach the other party; quitting reaches the owner', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const jobId = await openJob(owner);
      await accept(owner, jobId, await bid(contractor, jobId));
      const base = `/v1/jobs/${jobId}`;
      const author = await http()
        .post(`${base}/plan/author`)
        .set(owner.auth)
        .send({ version: 0, author: 'OWNER' })
        .expect(200);
      const draft = await http()
        .put(`${base}/plan`)
        .set(owner.auth)
        .send({
          version: author.body.version,
          sequential: false,
          stages: [{ title: 'Покраска', description: '', durationDays: 3 }],
        })
        .expect(200);
      const proposed = await http()
        .post(`${base}/plan/propose`)
        .set(owner.auth)
        .send({ version: draft.body.version })
        .expect(200);
      await http()
        .post(`${base}/plan/return`)
        .set(contractor.auth)
        .send({ version: proposed.body.version, reason: 'Нет этапа шпаклёвки' })
        .expect(200);
      expect(await kinds(contractor)).toEqual([
        'PLAN_PROPOSED',
        'PLAN_AUTHOR_CHANGED',
        'BID_ACCEPTED',
      ]);
      await http()
        .post(`${base}/quit`)
        .set(contractor.auth)
        .send({ reason: 'Не успеваю по срокам' })
        .expect(204);
      expect(await kinds(owner)).toEqual(['CONTRACTOR_QUIT', 'PLAN_RETURNED', 'BID_RECEIVED']);
    });

    it('new messages collect into one unread notification per job with a counter', async () => {
      const d = await dealWithPlan();
      const send = (who: Auth, body: string) =>
        http().post(`${d.base}/messages`).set(who.auth).send({ body }).expect(200);
      await send(d.owner, 'Когда начнёте?');
      await send(d.owner, 'И ещё вопрос про плитку');
      await Promise.all([send(d.owner, 'Третье'), send(d.owner, 'Четвёртое')]);
      let items = (await list(d.contractor)).body.items;
      expect(items[0]).toMatchObject({ kind: 'MESSAGE', count: 4, read: false });
      expect(items.filter((n: { kind: string }) => n.kind === 'MESSAGE')).toHaveLength(1);
      // Автор своё сообщение уведомлением не получает.
      expect(await kinds(d.owner)).not.toContain('MESSAGE');

      // После прочтения новое сообщение начинает новую строку; прочитанная остаётся в истории.
      await http()
        .post('/v1/me/notifications/read')
        .set(d.contractor.auth)
        .send({ jobId: d.jobId })
        .expect(200);
      await send(d.owner, 'Пятое');
      items = (await list(d.contractor)).body.items;
      const messages = items.filter((n: { kind: string }) => n.kind === 'MESSAGE');
      expect(messages).toEqual([
        expect.objectContaining({ count: 1, read: false }),
        expect.objectContaining({ count: 4, read: true }),
      ]);
      // Ответ исполнителя — заказчику.
      await send(d.contractor, 'Начну в понедельник');
      expect((await list(d.owner)).body.items[0]).toMatchObject({ kind: 'MESSAGE', count: 1 });
    });

    it('an idempotent replay of a message does not count twice', async () => {
      const d = await dealWithPlan();
      const send = () =>
        http()
          .post(`${d.base}/messages`)
          .set(d.owner.auth)
          .send({ body: 'Один раз', requestId: 'req-notify-1' })
          .expect(200);
      await send();
      await send();
      expect((await list(d.contractor)).body.items[0]).toMatchObject({ kind: 'MESSAGE', count: 1 });
    });
  });

  describe('reading', () => {
    it('summary counts unread per job; marking by job, by ids and all', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const contractors = [await signUp(app, 'CONTRACTOR'), await signUp(app, 'CONTRACTOR')];
      const first = await openJob(owner);
      const second = await openJob(owner);
      for (const contractor of contractors) {
        await bid(contractor, first);
        await bid(contractor, second);
      }
      let s = (await summary(owner)).body;
      expect(s.unread).toBe(4);
      expect(s.jobs).toHaveLength(2);
      expect(s.jobs).toEqual(
        expect.arrayContaining([
          { jobId: first, unread: 2 },
          { jobId: second, unread: 2 },
        ]),
      );

      s = (
        await http()
          .post('/v1/me/notifications/read')
          .set(owner.auth)
          .send({ jobId: first })
          .expect(200)
      ).body;
      expect(s).toEqual({ unread: 2, jobs: [{ jobId: second, unread: 2 }], reportDecisions: 0 });

      const [one] = (await list(owner)).body.items.filter(
        (n: { jobId: string }) => n.jobId === second,
      );
      s = (
        await http()
          .post('/v1/me/notifications/read')
          .set(owner.auth)
          .send({ ids: [one.id] })
          .expect(200)
      ).body;
      expect(s.unread).toBe(1);

      s = (
        await http()
          .post('/v1/me/notifications/read')
          .set(owner.auth)
          .send({ all: true })
          .expect(200)
      ).body;
      expect(s).toEqual({ unread: 0, jobs: [], reportDecisions: 0 });
      // Повтор — без ошибок и без изменений.
      await http()
        .post('/v1/me/notifications/read')
        .set(owner.auth)
        .send({ all: true })
        .expect(200);
    });

    it('each user sees and marks only their own notifications', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const stranger = await signUp(app, 'CUSTOMER');
      const jobId = await openJob(owner);
      await bid(contractor, jobId);
      const [own] = (await list(owner)).body.items;

      expect((await list(stranger)).body).toEqual({ items: [], unread: 0, nextCursor: null });
      // Чужие id и чужой заказ ничего не меняют.
      await http()
        .post('/v1/me/notifications/read')
        .set(stranger.auth)
        .send({ ids: [own.id] })
        .expect(200);
      await http().post('/v1/me/notifications/read').set(stranger.auth).send({ jobId }).expect(200);
      expect((await summary(owner)).body.unread).toBe(1);
      // Чужой курсор — как неверный.
      await http().get(`/v1/me/notifications?cursor=${own.id}`).set(stranger.auth).expect(400);
      await http().get('/v1/me/notifications').expect(401);
      await http().get('/v1/me/notifications/summary').expect(401);
      await http().post('/v1/me/notifications/read').send({ all: true }).expect(401);
    });

    it('rejects ambiguous or malformed marking requests', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const bad = [
        {},
        { all: true, jobId: 'abc' },
        { all: false },
        { ids: [] },
        { ids: ['a b'] },
        { ids: ['x', 'x'] },
        { ids: Array.from({ length: NOTIFICATION_LIMITS.MARK_MAX + 1 }, (_, i) => `id${i}`) },
        { jobId: '../x' },
      ];
      for (const body of bad) {
        await http().post('/v1/me/notifications/read').set(owner.auth).send(body).expect(400);
      }
      await http().get('/v1/me/notifications?cursor=a%20b').set(owner.auth).expect(400);
    });

    it('pages newest first with a cursor', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const jobId = await openJob(owner);
      const total = NOTIFICATION_LIMITS.PAGE + 5;
      await prisma.notification.createMany({
        data: Array.from({ length: total }, (_, i) => ({
          userId: owner.id,
          jobId,
          kind: 'BID_RECEIVED' as const,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        })),
      });
      const first = (await list(owner)).body;
      expect(first.items).toHaveLength(NOTIFICATION_LIMITS.PAGE);
      expect(first.unread).toBe(total);
      expect(first.nextCursor).toBe(first.items.at(-1).id);
      const second = (await list(owner, `?cursor=${first.nextCursor}`)).body;
      expect(second.items).toHaveLength(5);
      expect(second.nextCursor).toBeNull();
      const all = [...first.items, ...second.items].map((n: { createdAt: string }) => n.createdAt);
      expect(all).toEqual([...all].sort().reverse());
      expect(new Set(all).size).toBe(total);
      void contractor;
    });

    it('a job hidden by a moderator keeps its title from everyone but the owner (audit F-07)', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const jobId = await openJob(owner);
      await prisma.notification.createMany({
        data: [
          { userId: owner.id, jobId, kind: 'BID_RECEIVED' as const },
          { userId: contractor.id, jobId, kind: 'BID_REJECTED' as const },
        ],
      });
      await prisma.job.update({ where: { id: jobId }, data: { hiddenAt: new Date() } });
      const [mine] = (await list(owner)).body.items;
      expect(mine.jobTitle).toBe(jobBody.title);
      const [theirs] = (await list(contractor)).body.items;
      expect(theirs.jobTitle).toBe('Заказ скрыт модератором');
      expect(JSON.stringify((await list(contractor)).body)).not.toContain(jobBody.title);
    });

    it('notifications disappear with the job and with the user', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const contractor = await signUp(app, 'CONTRACTOR');
      const jobId = await openJob(owner);
      await bid(contractor, jobId);
      expect(await prisma.notification.count()).toBe(1);
      await prisma.bid.deleteMany();
      await prisma.job.delete({ where: { id: jobId } });
      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe('database guards', () => {
    it('one unread MESSAGE row per user and job; count and data are bounded', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const jobId = await openJob(owner);
      await prisma.notification.create({
        data: { userId: owner.id, jobId, kind: 'MESSAGE' },
      });
      await expect(
        prisma.notification.create({ data: { userId: owner.id, jobId, kind: 'MESSAGE' } }),
      ).rejects.toThrow();
      await expect(
        prisma.notification.create({
          data: { userId: owner.id, jobId, kind: 'BID_RECEIVED', count: 0 },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.notification.create({
          data: { userId: owner.id, jobId, kind: 'BID_RECEIVED', data: ['x'] },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.notification.create({
          data: { userId: owner.id, jobId, kind: 'BID_RECEIVED', data: { s: 'x'.repeat(2000) } },
        }),
      ).rejects.toThrow();
    });
  });
});
