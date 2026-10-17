import { JOB_DETAILS_LIMITS, SERVICE_AREA_ERROR } from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import { signUp } from './helpers';

const prisma = new PrismaClient();

const repairDetails = {
  objectType: 'apartment',
  housing: 'new',
  newState: 'concrete',
  area: 54,
  rooms: '2',
  repairLevel: 'capital',
  works: ['warmFloor', 'electrics'],
  warmFloorType: 'electric',
  start: 'month',
};

const repairJob = {
  title: 'Ремонт двушки в новостройке под ключ',
  description: 'Квартира 54 м² в бетоне, нужны черновые и чистовые работы, есть планировка.',
  category: 'REPAIR_TURNKEY' as const,
  city: 'Химки',
  budgetMin: 1_500_000,
  budgetMax: 2_000_000,
  details: repairDetails,
};

async function cleanDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
}

describe('Job questionnaire and service area (e2e)', () => {
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

  describe('details', () => {
    it('stores normalized answers and shows them in the catalog', async () => {
      const res = await create({
        ...repairJob,
        details: { ...repairDetails, oldState: 'old', houseFloors: 2 },
      }).expect(201);
      const expected = {
        objectType: 'apartment',
        housing: 'new',
        newState: 'concrete',
        area: 54,
        rooms: '2',
        repairLevel: 'capital',
        works: ['electrics', 'warmFloor'],
        warmFloorType: 'electric',
        start: 'month',
      };
      // Ответы на скрытые вопросы (вторичка, этажность дома) отброшены, порядок как в анкете.
      expect(res.body.details).toEqual(expected);
      expect(Object.keys(res.body.details)).toEqual(Object.keys(expected));

      const stored = await prisma.job.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.details).toEqual(expected);

      const publicJob = await http().get(`/v1/jobs/${res.body.id}`).expect(200);
      expect(publicJob.body.details).toEqual(expected);
      const list = await http().get('/v1/jobs').expect(200);
      expect(list.body.items[0].details).toEqual(expected);

      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: res.body.id } });
      expect(audit.changes).toMatchObject({ details: { from: {}, to: expected } });
    });

    it('requires the questionnaire on create', async () => {
      const missing = await create({ ...repairJob, details: undefined }).expect(400);
      expect(JSON.stringify(missing.body.message)).toContain('Заполните анкету заказа');
      const empty = await create({ ...repairJob, details: {} }).expect(400);
      expect(empty.body.message).toBe('Анкета заказа: Ответьте на вопрос «Тип объекта»');
      expect(await prisma.job.count()).toBe(0);
    });

    it('legacy jobs without answers stay editable and keep empty answers', async () => {
      // Заказ, созданный до анкеты: в базе details = {} (значение по умолчанию).
      const me = await http().get('/v1/me').set(auth).expect(200);
      const legacy = await prisma.job.create({
        data: { ...repairJob, details: undefined, ownerId: me.body.id },
      });
      expect(legacy.details).toEqual({});
      const res = await patch(legacy.id, { title: 'Ремонт двушки: уточнили сроки' }).expect(200);
      expect(res.body.details).toEqual({});
      // Дополнить анкету можно только целиком и по правилам категории.
      await patch(legacy.id, { details: { objectType: 'apartment' } }).expect(400);
      const filled = await patch(legacy.id, { details: repairDetails }).expect(200);
      expect(filled.body.details).toMatchObject({ area: 54, repairLevel: 'capital' });
    });

    it.each<[string, unknown, string]>([
      ['unknown question', { ...repairDetails, colour: 'red' }, 'которого нет в анкете'],
      ['unknown option', { ...repairDetails, repairLevel: 'luxury' }, 'такого варианта нет'],
      ['wrong type', { ...repairDetails, area: '54' }, '«Площадь»: укажите число'],
      ['out of range', { ...repairDetails, area: 3 }, '«Площадь»: от 5 до 2000 м²'],
      ['missing required', { objectType: 'apartment' }, 'Ответьте на вопрос «Рынок жилья»'],
      ['missing nested required', { ...repairDetails, newState: '' }, 'В каком состоянии'],
      ['array instead of object', ['area'], 'Ответы на вопросы передаются объектом'],
      ['string instead of object', 'area=54', 'Ответы на вопросы передаются объектом'],
    ])('rejects %s with a clear 400', async (_name, details, message) => {
      const res = await create({ ...repairJob, details }).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(message);
      expect(await prisma.job.count()).toBe(0);
    });

    it('rejects text answers that are too long and oversized payloads', async () => {
      const other = {
        ...repairJob,
        category: 'OTHER',
        details: { workType: 'other', otherTask: 'я'.repeat(121) },
      };
      const res = await create(other).expect(400);
      expect(res.body.message).toBe(
        'Анкета заказа: «Что именно нужно сделать»: не больше 120 символов',
      );

      const many = Object.fromEntries(
        Array.from({ length: JOB_DETAILS_LIMITS.MAX_KEYS + 1 }, (_, i) => [`q${i}`, 'x']),
      );
      const big = await create({ ...repairJob, details: many }).expect(400);
      expect(big.body.message).toBe('Анкета заказа: Слишком много ответов');
    });

    it('replaces answers on update and validates them against the category', async () => {
      const { body: job } = await create({ ...repairJob, details: repairDetails }).expect(201);
      const updated = await patch(job.id, {
        details: { ...repairDetails, housing: 'secondary', oldState: 'old', debrisRemoval: true },
      }).expect(200);
      expect(updated.body.details).toMatchObject({
        housing: 'secondary',
        oldState: 'old',
        debrisRemoval: true,
      });
      expect(updated.body.details).not.toHaveProperty('newState');

      await patch(job.id, { details: { task: 'full' } }).expect(400);
      const audit = await prisma.auditLog.findMany({
        where: { entityId: job.id, action: 'JOB_UPDATED' },
      });
      expect(audit).toHaveLength(1);
      expect(Object.keys(audit[0].changes as object)).toEqual(['details']);
    });

    it('changing the category requires answers for the new questionnaire', async () => {
      const { body: job } = await create({ ...repairJob, details: repairDetails }).expect(201);
      const res = await patch(job.id, { category: 'ELECTRICAL' }).expect(400);
      expect(res.body.message).toBe('При смене категории заполните анкету новой категории');
      const unchanged = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(unchanged.category).toBe('REPAIR_TURNKEY');
      expect(unchanged.details).toEqual(job.details);

      const moved = await patch(job.id, {
        category: 'PLUMBING',
        details: { task: 'leak', leakPlace: 'riser', urgent: true },
      }).expect(200);
      expect(moved.body.details).toEqual({ task: 'leak', leakPlace: 'riser', urgent: true });

      // Ответы проверяются по новой категории.
      const wrong = await patch(job.id, {
        category: 'TILING',
        details: { task: 'leak' },
      }).expect(400);
      expect(JSON.stringify(wrong.body.message)).toContain('которого нет в анкете');
    });

    it('rejects a details-only patch that changes nothing as before', async () => {
      const { body: job } = await create(repairJob).expect(201);
      const res = await patch(job.id, {}).expect(400);
      expect(res.body.message).toBe('Нет полей для изменения');
    });
  });

  describe('service area', () => {
    it.each(['Казань', 'Тверь', 'Новосибирск', 'Москва и область', ''])(
      'rejects %j on create with a clear 400',
      async (city) => {
        const res = await create({ ...repairJob, city }).expect(400);
        expect(res.body.message).toContain(SERVICE_AREA_ERROR);
        expect(await prisma.job.count()).toBe(0);
      },
    );

    it('rejects non-string cities', async () => {
      const res = await create({ ...repairJob, city: 42 }).expect(400);
      expect(res.body.message).toContain(SERVICE_AREA_ERROR);
    });

    it.each([
      ['  королев ', 'Королёв'],
      ['САНКТ-ПЕТЕРБУРГ', 'Санкт-Петербург'],
      ['новое девяткино', 'Новое Девяткино'],
      ['Щелково', 'Щёлково'],
    ])('accepts %j and stores the canonical name %j', async (city, canonical) => {
      const res = await create({ ...repairJob, city }).expect(201);
      expect(res.body.city).toBe(canonical);
    });

    it('validates the city on update, but keeps old rows untouched otherwise', async () => {
      const customer = await prisma.user.findFirstOrThrow({ where: { role: 'CUSTOMER' } });
      await prisma.job.create({
        data: { ...repairJob, id: 'legacy-job', city: 'Самара', ownerId: customer.id },
      });
      // Правка других полей не трогает старый город.
      const res = await patch('legacy-job', { title: 'Ремонт квартиры под ключ' }).expect(200);
      expect(res.body.city).toBe('Самара');

      const wrong = await patch('legacy-job', { city: 'Тольятти' }).expect(400);
      expect(wrong.body.message).toContain(SERVICE_AREA_ERROR);
      const moved = await patch('legacy-job', { city: 'мытищи' }).expect(200);
      expect(moved.body.city).toBe('Мытищи');
    });
  });
});
