import { LEAD_LIMITS, PRIVACY_POLICY_VERSION } from '@agregator/shared';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { LeadsService } from '../src/leads/leads.service';
import { createTestApp } from './create-app';
import { signUp } from './helpers';

const prisma = new PrismaClient();
const lead = { name: 'Ирина Петрова', phone: '+7 912 345-67-89', consent: true };

async function cleanDb(): Promise<void> {
  await prisma.lead.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.job.deleteMany({ where: { ownerId: { not: null } } });
  await prisma.user.deleteMany();
}

describe('Leads (e2e)', () => {
  let app: NestExpressApplication;
  const adminEmail = `owner-${Date.now()}@example.ru`;

  beforeAll(async () => {
    await cleanDb();
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    process.env.ADMIN_EMAILS = adminEmail;
    app = await createTestApp(false, { leadsEnabled: true });
  });

  afterAll(async () => {
    await app.close();
    delete process.env.WRITE_RATE_LIMIT_PER_MIN;
    delete process.env.ADMIN_EMAILS;
    await cleanDb();
    await prisma.$disconnect();
  });

  beforeEach(() => prisma.lead.deleteMany());

  const post = (body: object) => request(app.getHttpServer()).post('/v1/leads').send(body);

  describe('POST /v1/leads', () => {
    it('stores a normalized phone and the consent version', async () => {
      const res = await post({ ...lead, name: '  Ирина Петрова ' }).expect(201);
      expect(res.body).toEqual({ received: true });
      const rows = await prisma.lead.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        name: 'Ирина Петрова',
        phone: '+79123456789',
        consentVersion: PRIVACY_POLICY_VERSION,
        processedAt: null,
      });
    });

    it('does not duplicate the same phone within a day', async () => {
      await post(lead).expect(201);
      await post({ ...lead, phone: '8 912 345 67 89', name: 'Другое имя' }).expect(201);
      expect(await prisma.lead.count()).toBe(1);
    });

    it('accepts but drops honeypot submissions', async () => {
      const res = await post({ ...lead, website: 'http://spam.example' }).expect(201);
      expect(res.body).toEqual({ received: true });
      expect(await prisma.lead.count()).toBe(0);
    });

    it.each([
      [{ ...lead, phone: '12345' }, 'invalid phone'],
      [{ ...lead, phone: '+1 202 555 0143' }, 'foreign phone'],
      [{ ...lead, consent: false }, 'no consent'],
      [{ name: lead.name, phone: lead.phone }, 'consent missing'],
      [{ ...lead, consent: 'true' }, 'consent as string'],
      [{ ...lead, name: 'И' }, 'name too short'],
      [{ ...lead, name: 'И'.repeat(81) }, 'name too long'],
      [{ ...lead, name: 'Ирина‮' }, 'control characters in name'],
      [{ ...lead, role: 'ADMIN' }, 'unknown field'],
    ] as [object, string][])('rejects %j (%s) with 400', async (body) => {
      await post(body).expect(400);
      expect(await prisma.lead.count()).toBe(0);
    });

    it('enforces the daily cap with 429', async () => {
      await prisma.lead.createMany({
        data: Array.from({ length: LEAD_LIMITS.PER_DAY_MAX }, (_, i) => ({
          name: 'Заявка',
          phone: `+7900${String(i).padStart(7, '0')}`,
          consentVersion: PRIVACY_POLICY_VERSION,
        })),
      });
      await post(lead).expect(429);
      expect(await prisma.lead.count()).toBe(LEAD_LIMITS.PER_DAY_MAX);
    });

    // Сервис вызывается напрямую: через HTTP запросы приходят с разбросом и гонка почти не видна.
    it('serializes concurrent submissions: no duplicates', async () => {
      const leads = app.get(LeadsService);
      await Promise.all(Array.from({ length: 12 }, () => leads.create(lead)));
      expect(await prisma.lead.count()).toBe(1);
    });

    it('does not exceed the daily cap under concurrent submissions', async () => {
      await prisma.lead.createMany({
        data: Array.from({ length: LEAD_LIMITS.PER_DAY_MAX - 1 }, (_, i) => ({
          name: 'Заявка',
          phone: `+7900${String(i).padStart(7, '0')}`,
          consentVersion: PRIVACY_POLICY_VERSION,
        })),
      });
      const leads = app.get(LeadsService);
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          leads.create({ ...lead, phone: `+7901${String(i).padStart(7, '0')}` }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma.lead.count()).toBe(LEAD_LIMITS.PER_DAY_MAX);
    });

    it('is closed (503) while the privacy operator is not set', async () => {
      const closed = await createTestApp(false, { leadsEnabled: false });
      try {
        await request(closed.getHttpServer()).post('/v1/leads').send(lead).expect(503);
      } finally {
        await closed.close();
      }
      expect(await prisma.lead.count()).toBe(0);
    });
  });

  describe('admin', () => {
    let adminAuth: { Authorization: string };

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: adminEmail,
          password: 'admin-password-1',
          name: 'Владелец',
          role: 'CUSTOMER',
        })
        .expect(201);
      expect(res.body.user.role).toBe('ADMIN');
      adminAuth = { Authorization: `Bearer ${res.body.token}` };
    });

    it('lists leads newest first and filters by status', async () => {
      await post(lead).expect(201);
      await post({ ...lead, phone: '+7 900 000-00-01', name: 'Пётр' }).expect(201);
      const server = app.getHttpServer();
      const all = await request(server).get('/v1/admin/leads').set(adminAuth).expect(200);
      expect(all.body.total).toBe(2);
      expect(all.body.items[0].name).toBe('Пётр');

      await request(server)
        .patch(`/v1/admin/leads/${all.body.items[0].id}`)
        .set(adminAuth)
        .send({ processed: true })
        .expect(200);
      const fresh = await request(server)
        .get('/v1/admin/leads?status=new')
        .set(adminAuth)
        .expect(200);
      expect(fresh.body.items.map((l: { name: string }) => l.name)).toEqual(['Ирина Петрова']);
      const done = await request(server)
        .get('/v1/admin/leads?status=processed')
        .set(adminAuth)
        .expect(200);
      expect(done.body.items[0].processedAt).not.toBeNull();
    });

    it('writes the audit log and can reopen a lead', async () => {
      await post(lead).expect(201);
      const [row] = await prisma.lead.findMany();
      const server = app.getHttpServer();
      await request(server)
        .patch(`/v1/admin/leads/${row.id}`)
        .set(adminAuth)
        .send({ processed: true })
        .expect(200);
      const reopened = await request(server)
        .patch(`/v1/admin/leads/${row.id}`)
        .set(adminAuth)
        .send({ processed: false })
        .expect(200);
      expect(reopened.body.processedAt).toBeNull();
      const actions = await prisma.auditLog.findMany({
        where: { entityType: 'lead', entityId: row.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(actions.map((a) => a.action)).toEqual(['LEAD_PROCESSED', 'LEAD_REOPENED']);
    });

    it('is forbidden for customers and contractors, 401 without a session', async () => {
      const server = app.getHttpServer();
      for (const role of ['CUSTOMER', 'CONTRACTOR'] as const) {
        const user = await signUp(app, role);
        await request(server).get('/v1/admin/leads').set(user.auth).expect(403);
      }
      await request(server).get('/v1/admin/leads').expect(401);
    });

    it('promotes an existing account on login once its email is listed', async () => {
      const email = `late-${Date.now()}@example.ru`;
      const server = app.getHttpServer();
      await request(server)
        .post('/v1/auth/register')
        .send({ email, password: 'late-password-1', name: 'Поздний', role: 'CONTRACTOR' })
        .expect(201);
      process.env.ADMIN_EMAILS = `${adminEmail},${email}`;
      try {
        const res = await request(server)
          .post('/v1/auth/login')
          .send({ email, password: 'late-password-1' })
          .expect(200);
        expect(res.body.user.role).toBe('ADMIN');
      } finally {
        process.env.ADMIN_EMAILS = adminEmail;
      }
    });
  });
});
