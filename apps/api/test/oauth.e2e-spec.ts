import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './create-app';
import {
  type BankUser,
  CHALLENGE,
  type FakeBank,
  NONCE,
  ORIGIN,
  startFakeBank,
  STATE,
  VERIFIER,
} from './fake-bank';
import { signUp } from './helpers';

/**
 * Вход через банк против поддельного банка (локальный HTTP-сервер с ответами в формате Сбер ID и
 * Т-Банк ID): вход и регистрация, выбор роли, конфликт email, привязка к аккаунту, ошибки банка.
 */

const prisma = new PrismaClient();

describe('Bank login: Sber ID and T-ID (e2e)', () => {
  let app: NestExpressApplication;
  let bank: FakeBank;
  const http = () => request(app.getHttpServer());

  const clean = async () => {
    await prisma.auditLog.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.job.deleteMany();
    await prisma.jobDraft.deleteMany();
    await prisma.externalAccount.deleteMany();
    await prisma.user.deleteMany();
    bank?.reset();
  };

  const grant = (user: BankUser, extra?: { nonce?: string; aud?: string }) =>
    bank.grant(user, extra);
  const callback = (provider: string, code: string, role?: string) =>
    http()
      .post(`/v1/auth/oauth/${provider}/callback`)
      .send({ code, codeVerifier: VERIFIER, nonce: NONCE, ...(role ? { role } : {}) });

  const ivan: BankUser = {
    sub: 'sber-sub-ivan',
    email: 'Ivan.Petrov@Example.ru',
    given_name: 'Иван',
    family_name: 'Петров',
    phone_number: '+7 (903) 111-22-33',
  };

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
    bank = await startFakeBank();
    app = await createTestApp(false, { oauth: bank.config });
  });
  beforeEach(clean);
  afterAll(async () => {
    await clean();
    await app.close();
    await bank.close();
    await prisma.$disconnect();
    delete process.env.AUTH_RATE_LIMIT_PER_MIN;
  });

  it('lists configured banks and builds the bank login URL', async () => {
    const list = await http().get('/v1/auth/oauth/providers').expect(200);
    expect(list.body).toEqual([
      { id: 'sber', title: 'Сбер ID' },
      { id: 'tbank', title: 'Т-Банк ID' },
    ]);

    const sber = await http()
      .post('/v1/auth/oauth/sber/authorize')
      .send({ state: STATE, nonce: NONCE, codeChallenge: CHALLENGE })
      .expect(200);
    const url = new URL(sber.body.url);
    expect(url.origin + url.pathname).toBe('https://id.sber.ru/CSAFront/oidc/authorize.do');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_type: 'PRIVATE',
      client_id: 'sber-client',
      scope: 'openid name email mobile',
      state: STATE,
      nonce: NONCE,
      redirect_uri: `${ORIGIN}/auth/sber/callback`,
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
    });

    const tbank = await http()
      .post('/v1/auth/oauth/tbank/authorize')
      .send({ state: STATE, nonce: NONCE, codeChallenge: CHALLENGE })
      .expect(200);
    expect(Object.fromEntries(new URL(tbank.body.url).searchParams)).toEqual({
      client_id: 'tbank-client',
      redirect_uri: `${ORIGIN}/auth/tbank/callback`,
      state: STATE,
      response_type: 'code',
    });

    await http()
      .post('/v1/auth/oauth/sber/authorize')
      .send({ state: 'short', nonce: NONCE, codeChallenge: CHALLENGE })
      .expect(400);
    const unknown = await http()
      .post('/v1/auth/oauth/vk/authorize')
      .send({ state: STATE, nonce: NONCE, codeChallenge: CHALLENGE })
      .expect(404);
    expect(unknown.body.code).toBe('OAUTH_DISABLED');
  });

  it('registers a new person with a role, then signs them in to the same account', async () => {
    const first = await callback('sber', grant(ivan), 'CUSTOMER').expect(200);
    expect(first.body.user).toMatchObject({
      email: 'ivan.petrov@example.ru',
      name: 'Иван Петров',
      role: 'CUSTOMER',
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: first.body.user.id } });
    expect(user.phone).toBe('+79031112233');

    // Токен — по mTLS-эндпоинту с заголовками Сбера и PKCE; после входа — auth/completed.
    const token = bank.seen.find((r) => r.path === '/sber/token')!;
    expect(token.headers.rquid).toMatch(/^[0-9a-f]{32}$/);
    expect(token.headers['x-ibm-client-id']).toBe('sber-client');
    const form = new URLSearchParams(token.body);
    expect(form.get('code_verifier')).toBe(VERIFIER);
    expect(form.get('redirect_uri')).toBe(`${ORIGIN}/auth/sber/callback`);
    expect(
      bank.seen.find((r) => r.path === '/sber/userinfo')!.headers['x-introspect-rquid'],
    ).toMatch(/^[0-9a-f]{32}$/);
    expect(bank.seen.some((r) => r.path === '/sber/completed')).toBe(true);

    // Повторный вход: тот же аккаунт, роль из запроса игнорируется.
    const again = await callback('sber', grant(ivan), 'CONTRACTOR').expect(200);
    expect(again.body.user.id).toBe(first.body.user.id);
    expect(again.body.user.role).toBe('CUSTOMER');
    expect(await prisma.user.count()).toBe(1);
    await http().get('/v1/me').set('Authorization', `Bearer ${again.body.token}`).expect(200);
  });

  it('asks for a role when there is no account and finishes with a signed pending login', async () => {
    const res = await callback(
      'tbank',
      grant({ sub: 't-1', email: 'anna@example.ru', given_name: 'Анна' }),
    ).expect(409);
    expect(res.body).toMatchObject({ code: 'OAUTH_NEED_ROLE', name: 'Анна' });
    expect(await prisma.user.count()).toBe(0);

    // Т-Банк: токен с Basic-аутентификацией, userinfo с секретом в теле.
    const token = bank.seen.find((r) => r.path === '/tbank/token')!;
    expect(token.headers.authorization).toBe(
      `Basic ${Buffer.from('tbank-client:tbank-secret').toString('base64')}`,
    );
    expect(
      new URLSearchParams(bank.seen.find((r) => r.path === '/tbank/userinfo')!.body).get(
        'client_secret',
      ),
    ).toBe('tbank-secret');

    const [body, signature] = (res.body.pending as string).split('.');
    const forged = JSON.parse(Buffer.from(body!, 'base64url').toString()) as { profile: BankUser };
    forged.profile.sub = 'someone-else';
    const forgedToken = `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`;
    const rejected = await http()
      .post('/v1/auth/oauth/complete')
      .send({ pending: forgedToken, role: 'CUSTOMER' })
      .expect(410);
    expect(rejected.body.code).toBe('OAUTH_PENDING_EXPIRED');
    await http()
      .post('/v1/auth/oauth/complete')
      .send({ pending: res.body.pending, role: 'ADMIN' })
      .expect(400);

    const done = await http()
      .post('/v1/auth/oauth/complete')
      .send({ pending: res.body.pending, role: 'CONTRACTOR' })
      .expect(201);
    expect(done.body.user).toMatchObject({
      email: 'anna@example.ru',
      name: 'Анна',
      role: 'CONTRACTOR',
    });
    // Повтор того же pending (двойное нажатие) — вход в уже созданный аккаунт, а не второй.
    const repeat = await http()
      .post('/v1/auth/oauth/complete')
      .send({ pending: res.body.pending, role: 'CUSTOMER' })
      .expect(201);
    expect(repeat.body.user.id).toBe(done.body.user.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it('does not attach a bank login to an existing email and lets the owner link it instead', async () => {
    const owner = await signUp(app, 'CUSTOMER');
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).email;
    const person: BankUser = { sub: 'sber-owner', email, given_name: 'Олег' };

    const taken = await callback('sber', grant(person), 'CUSTOMER').expect(409);
    expect(taken.body.code).toBe('OAUTH_EMAIL_TAKEN');
    expect(await prisma.externalAccount.count()).toBe(0);

    await http()
      .post('/v1/me/oauth/sber/link')
      .set(owner.auth)
      .send({ code: grant(person), codeVerifier: VERIFIER, nonce: NONCE })
      .expect(204);
    const linked = await http().get('/v1/me/oauth').set(owner.auth).expect(200);
    expect(linked.body).toEqual([{ provider: 'sber', linkedAt: expect.any(String) }]);

    const signedIn = await callback('sber', grant(person)).expect(200);
    expect(signedIn.body.user.id).toBe(owner.id);

    // Тот же Сбер ID к другому аккаунту не привязать.
    const other = await signUp(app, 'CONTRACTOR');
    const conflict = await http()
      .post('/v1/me/oauth/sber/link')
      .set(other.auth)
      .send({ code: grant(person), codeVerifier: VERIFIER, nonce: NONCE })
      .expect(409);
    expect(conflict.body.code).toBe('OAUTH_ALREADY_LINKED');
    await http().get('/v1/me/oauth').expect(401);
  });

  it('rejects bank errors, a foreign id_token and a profile without email', async () => {
    const wrongNonce = await callback(
      'sber',
      grant(ivan, { nonce: 'x'.repeat(32) }),
      'CUSTOMER',
    ).expect(502);
    expect(wrongNonce.body.code).toBe('OAUTH_FAILED');
    await callback('sber', grant(ivan, { aud: 'another-site' }), 'CUSTOMER').expect(502);
    await callback('sber', 'unknown-code', 'CUSTOMER').expect(502);
    bank.setTokenStatus(500);
    await callback('sber', grant(ivan), 'CUSTOMER').expect(502);
    bank.setTokenStatus(200);
    const noEmail = await callback(
      'sber',
      grant({ sub: 'no-email', given_name: 'Пётр' }),
      'CUSTOMER',
    ).expect(422);
    expect(noEmail.body.code).toBe('OAUTH_NO_EMAIL');
    await callback('sber', 'bad code with spaces', 'CUSTOMER').expect(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it('blocking during a bank sign-in: no session survives the block (AUD-10)', async () => {
    const first = await callback('sber', grant(ivan), 'CUSTOMER').expect(200);
    const userId = first.body.user.id as string;
    // «Администратор» блокирует аккаунт и держит транзакцию открытой, пока идёт вход.
    let commit!: () => void;
    const held = new Promise<void>((resolve) => (commit = resolve));
    const block = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        await tx.user.update({ where: { id: userId }, data: { blockedAt: new Date() } });
        await tx.session.deleteMany({ where: { userId } });
        await held;
      },
      { timeout: 20_000 },
    );
    const signIn = callback('sber', grant(ivan)).then((res) => res);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    commit();
    await block;
    const res = await signIn;
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OAUTH_BLOCKED');
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });
});
