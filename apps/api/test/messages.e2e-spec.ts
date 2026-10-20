import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { createTestApp } from './create-app';
import { requiredAnswers, signUp } from './helpers';

const prisma = new PrismaClient();

const jobBody = {
  title: 'Ремонт кухни под ключ',
  description: 'Плитка, свет, вытяжка. Материалы покупает заказчик.',
  category: 'OTHER',
  details: requiredAnswers('OTHER'),
  city: 'Москва',
};
const bidBody = {
  price: 80_000,
  durationDays: 10,
  comment: 'Сделаю за десять дней, инструмент свой.',
};

type Auth = Awaited<ReturnType<typeof signUp>>;

/** Фото с телефона: поворот в EXIF (6 — на 90°) и геолокация, которые не должны дойти до хранения. */
function phonePhoto(width = 800, height = 400): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#c2410c' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: 'Phone', Model: 'Camera X' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 45/1 0/1' },
    })
    .toBuffer();
}

describe('Job messages and photos (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    process.env.WRITE_RATE_LIMIT_PER_MIN = '1000';
    app = await createTestApp();
  });

  const clean = async () => {
    await prisma.auditLog.deleteMany();
    await prisma.jobMessage.deleteMany();
    await prisma.jobPhoto.deleteMany();
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

  async function openJob(owner: Auth) {
    const { body: job } = await http()
      .post('/v1/me/jobs')
      .set(owner.auth)
      .send(jobBody)
      .expect(201);
    return job.id as string;
  }

  async function bidAndAccept(owner: Auth, jobId: string, contractor: Auth) {
    const { body: bid } = await http()
      .post(`/v1/jobs/${jobId}/bids`)
      .set(contractor.auth)
      .send(bidBody)
      .expect(201);
    await http().post(`/v1/me/jobs/${jobId}/bids/${bid.id}/accept`).set(owner.auth).expect(200);
    return bid.id as string;
  }

  /** Заказ в работе: владелец, выбранный исполнитель и подрядчик, чей отклик отклонён. */
  async function deal() {
    const owner = await signUp(app, 'CUSTOMER');
    const contractor = await signUp(app, 'CONTRACTOR');
    const other = await signUp(app, 'CONTRACTOR');
    const jobId = await openJob(owner);
    await http().post(`/v1/jobs/${jobId}/bids`).set(other.auth).send(bidBody).expect(201);
    await bidAndAccept(owner, jobId, contractor);
    return { owner, contractor, other, jobId, base: `/v1/jobs/${jobId}` };
  }

  const send = (base: string, who: Auth, body: string, requestId?: string) =>
    http()
      .post(`${base}/messages`)
      .set(who.auth)
      .send({ body, ...(requestId ? { requestId } : {}) });

  describe('access', () => {
    it('only the owner and the chosen contractor read and write; others get 404', async () => {
      const d = await deal();
      const stranger = await signUp(app, 'CUSTOMER');
      const owner = await http().get(`${d.base}/messages`).set(d.owner.auth).expect(200);
      expect(owner.body).toEqual({ jobId: d.jobId, viewer: 'OWNER', canWrite: true, items: [] });
      const contractor = await http().get(`${d.base}/messages`).set(d.contractor.auth).expect(200);
      expect(contractor.body.viewer).toBe('CONTRACTOR');
      for (const who of [d.other, stranger]) {
        await http().get(`${d.base}/messages`).set(who.auth).expect(404);
        await send(d.base, who, 'Здравствуйте').expect(404);
      }
      await http().get('/v1/jobs/../messages').set(d.owner.auth).expect(404);
      expect(await prisma.jobMessage.count()).toBe(0);
    });

    it('a job without a chosen contractor has no conversation, even for the owner', async () => {
      const owner = await signUp(app, 'CUSTOMER');
      const jobId = await openJob(owner);
      const res = await http().get(`/v1/jobs/${jobId}/messages`).set(owner.auth).expect(404);
      expect(res.body.message).toContain('после выбора исполнителя');
    });
  });

  describe('conversation', () => {
    it('both sides write; each sees whose message it is, oldest first', async () => {
      const d = await deal();
      await send(d.base, d.owner, '  Когда сможете начать?  ').expect(200);
      const res = await send(d.base, d.contractor, 'В понедельник утром.\nСо своим инструментом.');
      expect(res.status).toBe(200);
      expect(
        res.body.items.map((m: { author: string; own: boolean; body: string }) => [
          m.author,
          m.own,
          m.body,
        ]),
      ).toEqual([
        ['OWNER', false, 'Когда сможете начать?'],
        ['CONTRACTOR', true, 'В понедельник утром.\nСо своим инструментом.'],
      ]);
      const owner = await http().get(`${d.base}/messages`).set(d.owner.auth).expect(200);
      expect(owner.body.items.map((m: { own: boolean }) => m.own)).toEqual([true, false]);
    });

    it('rejects an empty message, a too long one and control characters', async () => {
      const d = await deal();
      for (const body of ['', '   ', 'я'.repeat(2001), 'текст\u0007']) {
        await send(d.base, d.owner, body).expect(400);
      }
      expect(await prisma.jobMessage.count()).toBe(0);
    });

    it('a repeated send with the same key creates one message', async () => {
      const d = await deal();
      const key = 'form-key-0001';
      await send(d.base, d.owner, 'Проверьте размеры', key).expect(200);
      const again = await send(d.base, d.owner, 'Проверьте размеры', key).expect(200);
      expect(again.body.items).toHaveLength(1);
      // Тот же ключ в другом заказе — устаревшая форма, а не новое сообщение.
      const contractor2 = await signUp(app, 'CONTRACTOR');
      const jobId2 = await openJob(d.owner);
      await bidAndAccept(d.owner, jobId2, contractor2);
      await send(`/v1/jobs/${jobId2}`, d.owner, 'Другой заказ', key).expect(409);
      expect(await prisma.jobMessage.count()).toBe(1);
    });

    it('after the job is closed the conversation stays readable but closed for writing', async () => {
      const d = await deal();
      await send(d.base, d.contractor, 'Работы закончены').expect(200);
      await http()
        .post(`/v1/me/jobs/${d.jobId}/close`)
        .set(d.owner.auth)
        .send({ outcome: 'COMPLETED' })
        .expect(200);
      const res = await http().get(`${d.base}/messages`).set(d.contractor.auth).expect(200);
      expect(res.body).toMatchObject({ canWrite: false, items: [{ body: 'Работы закончены' }] });
      await send(d.base, d.owner, 'Спасибо!').expect(409);
    });

    it('after the contractor quits, a new contractor does not see the old conversation', async () => {
      const d = await deal();
      await send(d.base, d.owner, 'Сообщение прежнему исполнителю').expect(200);
      await http()
        .post(`${d.base}/quit`)
        .set(d.contractor.auth)
        .send({ reason: 'Не успеваю по срокам' })
        .expect(204);
      await http().get(`${d.base}/messages`).set(d.contractor.auth).expect(404);
      // Отклик другого подрядчика снова на рассмотрении — заказчик выбирает его.
      const pending = await prisma.bid.findFirstOrThrow({
        where: { jobId: d.jobId, contractorId: d.other.id },
      });
      await http()
        .post(`/v1/me/jobs/${d.jobId}/bids/${pending.id}/accept`)
        .set(d.owner.auth)
        .expect(200);
      const fresh = await http().get(`${d.base}/messages`).set(d.other.auth).expect(200);
      expect(fresh.body.items).toEqual([]);
      const owner = await http().get(`${d.base}/messages`).set(d.owner.auth).expect(200);
      expect(owner.body.items).toEqual([]);
      expect(await prisma.jobMessage.count()).toBe(1);
    });
  });

  describe('photos', () => {
    it('stores photos re-encoded: rotated by EXIF, without metadata, full and thumbnail', async () => {
      const d = await deal();
      const photo = await phonePhoto(3000, 1500);
      const res = await http()
        .post(`${d.base}/messages`)
        .set(d.contractor.auth)
        .field('body', 'Так сейчас выглядит стена')
        .attach('photos', photo, { filename: 'IMG_0001.jpg', contentType: 'image/jpeg' })
        .attach('photos', await phonePhoto(), { filename: 'b.jpg', contentType: 'image/jpeg' })
        .expect(200);
      const [message] = res.body.items;
      expect(message.body).toBe('Так сейчас выглядит стена');
      expect(message.photos).toHaveLength(2);
      // Поворот на 90° по EXIF, большая сторона уменьшена до 2000 px.
      expect(message.photos[0]).toMatchObject({ width: 1000, height: 2000 });

      const url = `${d.base}/photos/${message.photos[0].id}`;
      const full = await http()
        .get(url)
        .set(d.owner.auth)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(full.headers['content-type']).toBe('image/webp');
      expect(full.headers['cache-control']).toContain('private');
      const meta = await sharp(full.body as Buffer).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 1000, height: 2000 });
      expect(meta.exif).toBeUndefined();

      const thumb = await http()
        .get(`${url}?size=thumb`)
        .set(d.contractor.auth)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const thumbMeta = await sharp(thumb.body as Buffer).metadata();
      expect(Math.max(thumbMeta.width!, thumbMeta.height!)).toBe(480);
      await http().get(`${url}?size=huge`).set(d.owner.auth).expect(400);
    });

    it('photo-only message is allowed; strangers, other jobs and wrong ids get 404', async () => {
      const d = await deal();
      const stranger = await signUp(app, 'CONTRACTOR');
      const res = await http()
        .post(`${d.base}/messages`)
        .set(d.owner.auth)
        .attach('photos', await phonePhoto(), { filename: 'a.jpg', contentType: 'image/jpeg' })
        .expect(200);
      const id = res.body.items[0].photos[0].id as string;
      expect(res.body.items[0].body).toBe('');
      await http().get(`${d.base}/photos/${id}`).set(stranger.auth).expect(404);
      await http().get(`${d.base}/photos/${id}`).set(d.other.auth).expect(404);
      await http().get(`${d.base}/photos/${id}`).expect(401);
      const otherJob = await openJob(d.owner);
      await http().get(`/v1/jobs/${otherJob}/photos/${id}`).set(d.owner.auth).expect(404);
      await http().get(`${d.base}/photos/nope`).set(d.owner.auth).expect(404);
      await http().get(`${d.base}/photos/a%2Fb`).set(d.owner.auth).expect(404);
      // Администратор видит фото (разбор спора); роль выдаётся только миграцией или вручную.
      await prisma.user.update({ where: { id: stranger.id }, data: { role: 'ADMIN' } });
      await http().get(`${d.base}/photos/${id}`).set(stranger.auth).expect(200);
    });

    it('rejects non-images, too many and too large files without saving anything', async () => {
      const d = await deal();
      await http()
        .post(`${d.base}/messages`)
        .set(d.owner.auth)
        .field('body', 'Не фото')
        .attach('photos', Buffer.from('%PDF-1.4 not an image'), {
          filename: 'a.jpg',
          contentType: 'image/jpeg',
        })
        .expect(400);
      const tooMany = http().post(`${d.base}/messages`).set(d.owner.auth).field('body', 'Шесть');
      const small = await phonePhoto(40, 40);
      for (let i = 0; i < 6; i += 1) {
        tooMany.attach('photos', small, { filename: `${i}.jpg`, contentType: 'image/jpeg' });
      }
      await tooMany.expect(400);
      await http()
        .post(`${d.base}/messages`)
        .set(d.owner.auth)
        .attach('photos', Buffer.alloc(8 * 1024 * 1024 + 1, 1), {
          filename: 'big.jpg',
          contentType: 'image/jpeg',
        })
        .expect(413);
      expect(await prisma.jobMessage.count()).toBe(0);
      expect(await prisma.jobPhoto.count()).toBe(0);
    });

    it('a stage is submitted with a photo report; a repeated submission adds no photos', async () => {
      const d = await deal();
      const stages = [{ title: 'Демонтаж', description: '', durationDays: 2 }];
      const draft = await http()
        .put(`${d.base}/plan`)
        .set(d.contractor.auth)
        .send({ version: 0, sequential: true, stages })
        .expect(200);
      const proposed = await http()
        .post(`${d.base}/plan/propose`)
        .set(d.contractor.auth)
        .send({ version: draft.body.version })
        .expect(200);
      const approved = await http()
        .post(`${d.base}/plan/approve`)
        .set(d.owner.auth)
        .send({ version: proposed.body.version })
        .expect(200);
      const stageId = approved.body.stages[0].id as string;
      expect(approved.body.stages[0].photos).toEqual([]);
      const submit = () =>
        http()
          .post(`${d.base}/stages/${stageId}/submit`)
          .set(d.contractor.auth)
          .field('comment', 'Старая плитка снята')
          .attach('photos', small, { filename: 'a.jpg', contentType: 'image/jpeg' })
          .attach('photos', small, { filename: 'b.jpg', contentType: 'image/jpeg' });
      const small = await phonePhoto(200, 100);
      const res = await submit().expect(200);
      expect(res.body.stages[0]).toMatchObject({
        status: 'SUBMITTED',
        submitComment: 'Старая плитка снята',
      });
      expect(res.body.stages[0].photos).toHaveLength(2);
      const again = await submit().expect(200);
      expect(again.body.stages[0].photos).toHaveLength(2);
      const owner = await http().get(`${d.base}/plan`).set(d.owner.auth).expect(200);
      await http()
        .get(`${d.base}/photos/${owner.body.stages[0].photos[0].id}`)
        .set(d.owner.auth)
        .expect(200);
      // Отказ исполнителя удаляет план, а с ним этапы и фото-отчёт.
      await http()
        .post(`${d.base}/quit`)
        .set(d.contractor.auth)
        .send({ reason: 'Не успеваю по срокам' })
        .expect(204);
      expect(await prisma.jobPhoto.count()).toBe(0);
      expect(await prisma.jobPhotoBlob.count()).toBe(0);
    });
  });
});
