import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp } from './helpers';

const prisma = new PrismaClient();

const jobBody = {
  title: 'Ремонт ванной под ключ',
  description: 'Плитка, сантехника, вытяжка. Материалы покупает заказчик.',
  category: 'OTHER',
  details: requiredAnswers('OTHER'),
  city: 'Москва',
};
const bidBody = {
  price: 120_000,
  durationDays: 14,
  comment: 'Сделаю за две недели, свой инструмент.',
};
const stages = [
  { title: 'Демонтаж', description: 'Старая плитка и сантехника', durationDays: 2 },
  { title: 'Плитка', description: '', durationDays: 7 },
  { title: 'Сантехника', description: 'Установка и подключение', durationDays: null },
];

type Auth = Awaited<ReturnType<typeof signUp>>;

describe('Job plan and stages (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  const clean = async () => {
    await prisma.auditLog.deleteMany();
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

  /** Заказ в работе: владелец, выбранный исполнитель и подрядчик, чей отклик отклонён. */
  async function deal() {
    const owner = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');
    const other = await signUp(app, 'CONTRACTOR');
    const { body: job } = await http()
      .post('/v1/me/jobs')
      .set(owner.auth)
      .send(jobBody)
      .expect(201);
    const { body: bid } = await http()
      .post(`/v1/jobs/${job.id}/bids`)
      .set(contractor.auth)
      .send(bidBody)
      .expect(201);
    const { body: otherBid } = await http()
      .post(`/v1/jobs/${job.id}/bids`)
      .set(other.auth)
      .send(bidBody)
      .expect(201);
    await http().post(`/v1/me/jobs/${job.id}/bids/${bid.id}/accept`).set(owner.auth).expect(200);
    const base = `/v1/jobs/${job.id}`;
    return { owner, contractor, other, jobId: job.id as string, bid, otherBid, base };
  }

  const save = (base: string, who: Auth, version: number, sequential = true, list = stages) =>
    http().put(`${base}/plan`).set(who.auth).send({ version, sequential, stages: list });

  /** План согласован: исполнитель составил и отправил, заказчик согласовал. */
  async function approved(sequential = true) {
    const d = await deal();
    const draft = await save(d.base, d.contractor, 0, sequential).expect(200);
    const proposed = await http()
      .post(`${d.base}/plan/propose`)
      .set(d.contractor.auth)
      .send({ version: draft.body.version })
      .expect(200);
    const plan = await http()
      .post(`${d.base}/plan/approve`)
      .set(d.owner.auth)
      .send({ version: proposed.body.version })
      .expect(200);
    return { ...d, plan: plan.body };
  }

  describe('access', () => {
    it('only the owner and the chosen contractor see the plan; others get 404', async () => {
      const d = await deal();
      const stranger = await signUp(app, 'CUSTOMER');
      const owner = await http().get(`${d.base}/plan`).set(d.owner.auth).expect(200);
      expect(owner.body).toMatchObject({
        status: 'DRAFT',
        version: 0,
        author: 'CONTRACTOR',
        viewer: 'OWNER',
        stages: [],
      });
      const mine = await http().get(`${d.base}/plan`).set(d.contractor.auth).expect(200);
      expect(mine.body.viewer).toBe('CONTRACTOR');
      await http().get(`${d.base}/plan`).set(d.other.auth).expect(404);
      await http().get(`${d.base}/plan`).set(stranger.auth).expect(404);
      await http().get(`${d.base}/plan`).expect(401);
      await save(d.base, d.other, 0).expect(404);
    });

    it('an open job without a chosen contractor has no plan', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const { body: job } = await http().post('/v1/me/jobs').set(owner.auth).send(jobBody);
      const res = await http().get(`/v1/jobs/${job.id}/plan`).set(owner.auth).expect(404);
      expect(res.body.message).toContain('после выбора исполнителя');
    });
  });

  describe('drafting and approval', () => {
    it('full flow: draft → propose → approve; versions grow; journal records each step', async () => {
      const d = await deal();
      const draft = await save(d.base, d.contractor, 0).expect(200);
      expect(draft.body).toMatchObject({ status: 'DRAFT', version: 1, sequential: true });
      expect(
        draft.body.stages.map((s: { title: string; position: number }) => [s.position, s.title]),
      ).toEqual([
        [1, 'Демонтаж'],
        [2, 'Плитка'],
        [3, 'Сантехника'],
      ]);
      const proposed = await http()
        .post(`${d.base}/plan/propose`)
        .set(d.contractor.auth)
        .send({ version: 1 })
        .expect(200);
      expect(proposed.body).toMatchObject({ status: 'PROPOSED', version: 2 });
      const ok = await http()
        .post(`${d.base}/plan/approve`)
        .set(d.owner.auth)
        .send({ version: 2 })
        .expect(200);
      expect(ok.body).toMatchObject({ status: 'APPROVED', version: 3 });
      expect(ok.body.approvedAt).not.toBeNull();
      const actions = await prisma.auditLog.findMany({
        where: { entityId: d.jobId },
        orderBy: { createdAt: 'asc' },
      });
      expect(actions.map((a) => a.action)).toEqual(
        expect.arrayContaining(['PLAN_SAVED', 'PLAN_PROPOSED', 'PLAN_APPROVED']),
      );
    });

    it('only the author edits and proposes; only the other side approves or returns', async () => {
      const d = await deal();
      await save(d.base, d.owner, 0).expect(403);
      await save(d.base, d.contractor, 0).expect(200);
      await http()
        .post(`${d.base}/plan/propose`)
        .set(d.owner.auth)
        .send({ version: 1 })
        .expect(403);
      await http()
        .post(`${d.base}/plan/propose`)
        .set(d.contractor.auth)
        .send({ version: 1 })
        .expect(200);
      await http()
        .post(`${d.base}/plan/approve`)
        .set(d.contractor.auth)
        .send({ version: 2 })
        .expect(403);
      await http()
        .post(`${d.base}/plan/return`)
        .set(d.contractor.auth)
        .send({ version: 2, reason: 'сам себе' })
        .expect(403);
    });

    it('returned plan goes back to the author with the reason and can be edited again', async () => {
      const d = await deal();
      await save(d.base, d.contractor, 0).expect(200);
      await http()
        .post(`${d.base}/plan/propose`)
        .set(d.contractor.auth)
        .send({ version: 1 })
        .expect(200);
      const back = await http()
        .post(`${d.base}/plan/return`)
        .set(d.owner.auth)
        .send({ version: 2, reason: 'Добавьте этап уборки' })
        .expect(200);
      expect(back.body).toMatchObject({
        status: 'DRAFT',
        version: 3,
        returnReason: 'Добавьте этап уборки',
      });
      const more = [...stages, { title: 'Уборка', description: '', durationDays: 1 }];
      const edited = await save(d.base, d.contractor, 3, true, more).expect(200);
      expect(edited.body.stages).toHaveLength(4);
    });

    it('owner can make themselves the author while the plan is a draft, not after it is proposed', async () => {
      const d = await deal();
      await http()
        .post(`${d.base}/plan/author`)
        .set(d.contractor.auth)
        .send({ version: 0, author: 'CONTRACTOR' })
        .expect(403);
      const switched = await http()
        .post(`${d.base}/plan/author`)
        .set(d.owner.auth)
        .send({ version: 0, author: 'OWNER' })
        .expect(200);
      expect(switched.body).toMatchObject({ author: 'OWNER', version: 1 });
      await save(d.base, d.contractor, 1).expect(403);
      await save(d.base, d.owner, 1).expect(200);
      await http()
        .post(`${d.base}/plan/propose`)
        .set(d.owner.auth)
        .send({ version: 2 })
        .expect(200);
      await http()
        .post(`${d.base}/plan/author`)
        .set(d.owner.auth)
        .send({ version: 3, author: 'CONTRACTOR' })
        .expect(409);
      // Согласует исполнитель.
      await http()
        .post(`${d.base}/plan/approve`)
        .set(d.owner.auth)
        .send({ version: 3 })
        .expect(403);
      await http()
        .post(`${d.base}/plan/approve`)
        .set(d.contractor.auth)
        .send({ version: 3 })
        .expect(200);
    });

    it('rejects invalid input and empty or stale proposals', async () => {
      const d = await deal();
      await save(d.base, d.contractor, 0, true, [
        { title: 'ab', description: '', durationDays: null },
      ]).expect(400);
      await save(
        d.base,
        d.contractor,
        0,
        true,
        Array.from({ length: 11 }, (_, i) => ({
          title: `Этап ${i}`,
          description: '',
          durationDays: 1,
        })),
      ).expect(400);
      await save(d.base, d.contractor, 0, true, [
        { title: 'Этап', description: '', durationDays: 0 },
      ]).expect(400);
      await save(d.base, d.contractor, 0, true, []).expect(200);
      const empty = await http()
        .post(`${d.base}/plan/propose`)
        .set(d.contractor.auth)
        .send({ version: 1 })
        .expect(409);
      expect(empty.body.message).toContain('хотя бы один этап');
      await save(d.base, d.contractor, 0).expect(409); // версия устарела
      await save(d.base, d.contractor, 1).expect(200);
    });

    it('a proposed or approved plan cannot be edited', async () => {
      const d = await approved();
      await save(d.base, d.contractor, d.plan.version).expect(409);
    });
  });

  describe('stages', () => {
    it('sequential: submit in order, rework, resubmit, accept all; journal per stage', async () => {
      const d = await approved(true);
      const [first, second, third] = d.plan.stages;
      const early = await http()
        .post(`${d.base}/stages/${second.id}/submit`)
        .set(d.contractor.auth)
        .send({ comment: 'Готово раньше' })
        .expect(409);
      expect(early.body.message).toContain('по порядку');
      await http().post(`${d.base}/stages/${first.id}/accept`).set(d.owner.auth).expect(409); // не сдан
      await http()
        .post(`${d.base}/stages/${first.id}/submit`)
        .set(d.owner.auth)
        .send({ comment: 'Сдаю я' })
        .expect(403);
      const sub = await http()
        .post(`${d.base}/stages/${first.id}/submit`)
        .set(d.contractor.auth)
        .send({ comment: 'Демонтаж закончен' })
        .expect(200);
      expect(sub.body.stages[0]).toMatchObject({
        status: 'SUBMITTED',
        submitComment: 'Демонтаж закончен',
      });
      await http().post(`${d.base}/stages/${first.id}/accept`).set(d.contractor.auth).expect(403);
      const rework = await http()
        .post(`${d.base}/stages/${first.id}/rework`)
        .set(d.owner.auth)
        .send({ comment: 'Остался мусор в углу' })
        .expect(200);
      expect(rework.body.stages[0]).toMatchObject({
        status: 'REWORK',
        reworkComment: 'Остался мусор в углу',
      });
      await http()
        .post(`${d.base}/stages/${first.id}/submit`)
        .set(d.contractor.auth)
        .send({ comment: 'Убрал мусор' })
        .expect(200);
      await http().post(`${d.base}/stages/${first.id}/accept`).set(d.owner.auth).expect(200);
      for (const stage of [second, third]) {
        await http()
          .post(`${d.base}/stages/${stage.id}/submit`)
          .set(d.contractor.auth)
          .send({ comment: 'Этап готов' })
          .expect(200);
        await http().post(`${d.base}/stages/${stage.id}/accept`).set(d.owner.auth).expect(200);
      }
      const final = await http().get(`${d.base}/plan`).set(d.owner.auth).expect(200);
      expect(final.body.stages.every((s: { status: string }) => s.status === 'ACCEPTED')).toBe(
        true,
      );
      expect(
        await prisma.auditLog.count({ where: { entityId: first.id, action: 'STAGE_SUBMITTED' } }),
      ).toBe(2);
      expect(
        await prisma.auditLog.count({ where: { entityId: first.id, action: 'STAGE_REWORK' } }),
      ).toBe(1);
      expect(
        await prisma.auditLog.count({ where: { entityId: first.id, action: 'STAGE_ACCEPTED' } }),
      ).toBe(1);
      // Заказ закрывается как выполненный.
      await http()
        .post(`/v1/me/jobs/${d.jobId}/close`)
        .set(d.owner.auth)
        .send({ outcome: 'COMPLETED' })
        .expect(200);
      await http()
        .post(`${d.base}/stages/${third.id}/rework`)
        .set(d.owner.auth)
        .send({ comment: 'После закрытия' })
        .expect(409);
    });

    it('any order: a later stage can be submitted first', async () => {
      const d = await approved(false);
      const last = d.plan.stages[2];
      await http()
        .post(`${d.base}/stages/${last.id}/submit`)
        .set(d.contractor.auth)
        .send({ comment: 'Сантехника готова' })
        .expect(200);
    });

    it('stages are submitted only after the plan is approved', async () => {
      const d = await deal();
      const draft = await save(d.base, d.contractor, 0).expect(200);
      await http()
        .post(`${d.base}/stages/${draft.body.stages[0].id}/submit`)
        .set(d.contractor.auth)
        .send({ comment: 'Сдаю слишком рано' })
        .expect(409);
    });

    it('a repeated action returns the current state instead of an error', async () => {
      const d = await approved();
      const first = d.plan.stages[0];
      const submit = () =>
        http()
          .post(`${d.base}/stages/${first.id}/submit`)
          .set(d.contractor.auth)
          .send({ comment: 'Готово' });
      await submit().expect(200);
      await submit().expect(200);
      const accept = () => http().post(`${d.base}/stages/${first.id}/accept`).set(d.owner.auth);
      await accept().expect(200);
      await accept().expect(200);
      expect(
        await prisma.auditLog.count({ where: { entityId: first.id, action: 'STAGE_ACCEPTED' } }),
      ).toBe(1);
      // Повтор согласования с той же (уже устаревшей) версией.
      await http()
        .post(`${d.base}/plan/approve`)
        .set(d.owner.auth)
        .send({ version: d.plan.version - 1 })
        .expect(200);
    });
  });

  describe('races', () => {
    it('parallel accept and rework of one stage: exactly one wins, database matches it', async () => {
      const d = await approved();
      const first = d.plan.stages[0];
      await http()
        .post(`${d.base}/stages/${first.id}/submit`)
        .set(d.contractor.auth)
        .send({ comment: 'Готово' })
        .expect(200);
      const results = await Promise.all([
        ...Array.from({ length: 3 }, () =>
          http().post(`${d.base}/stages/${first.id}/accept`).set(d.owner.auth),
        ),
        ...Array.from({ length: 3 }, (_, i) =>
          http()
            .post(`${d.base}/stages/${first.id}/rework`)
            .set(d.owner.auth)
            .send({ comment: `Доработать ${i}` }),
        ),
      ]);
      const stored = await prisma.jobStage.findUniqueOrThrow({ where: { id: first.id } });
      const accepted = await prisma.auditLog.count({
        where: { entityId: first.id, action: 'STAGE_ACCEPTED' },
      });
      const reworked = await prisma.auditLog.count({
        where: { entityId: first.id, action: 'STAGE_REWORK' },
      });
      expect(accepted + reworked).toBe(1);
      expect(stored.status).toBe(accepted ? 'ACCEPTED' : 'REWORK');
      expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    });

    it('parallel draft saves with one version: one applies, the rest get 409', async () => {
      const d = await deal();
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          save(d.base, d.contractor, 0, true, [
            { title: `Вариант ${i}`, description: '', durationDays: 1 },
          ]),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
      expect(await prisma.jobStage.count()).toBe(1);
      expect(await prisma.jobPlan.count()).toBe(1);
    });
  });

  describe('contractor quits', () => {
    it('job reopens, the plan is removed, bids rejected because of the choice are pending again', async () => {
      const d = await approved();
      await http()
        .post(`${d.base}/quit`)
        .set(d.other.auth)
        .send({ reason: 'Я не исполнитель' })
        .expect(404);
      await http()
        .post(`${d.base}/quit`)
        .set(d.owner.auth)
        .send({ reason: 'Я заказчик' })
        .expect(403);
      await http()
        .post(`${d.base}/quit`)
        .set(d.contractor.auth)
        .send({ reason: 'abc' })
        .expect(400);
      await http()
        .post(`${d.base}/quit`)
        .set(d.contractor.auth)
        .send({ reason: 'Заболел, не смогу закончить' })
        .expect(204);
      const job = await prisma.job.findUniqueOrThrow({ where: { id: d.jobId } });
      expect(job.status).toBe('OPEN');
      expect(await prisma.jobPlan.count({ where: { jobId: d.jobId } })).toBe(0);
      expect((await prisma.bid.findUniqueOrThrow({ where: { id: d.bid.id } })).status).toBe(
        'WITHDRAWN',
      );
      const reopened = await prisma.bid.findUniqueOrThrow({ where: { id: d.otherBid.id } });
      expect(reopened).toMatchObject({ status: 'PENDING', rejectReason: null });
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: d.jobId, action: 'CONTRACTOR_QUIT' },
      });
      expect(entry.changes).toMatchObject({ reason: { to: 'Заболел, не смогу закончить' } });
      // Бывший исполнитель больше не сторона сделки; заказчик выбирает другого.
      await http().get(`${d.base}/plan`).set(d.contractor.auth).expect(404);
      await http()
        .post(`/v1/me/jobs/${d.jobId}/bids/${d.otherBid.id}/accept`)
        .set(d.owner.auth)
        .expect(200);
      const fresh = await http().get(`${d.base}/plan`).set(d.other.auth).expect(200);
      expect(fresh.body).toMatchObject({ version: 0, stages: [] });
    });
  });
});
