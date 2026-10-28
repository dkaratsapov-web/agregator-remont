import { type AuthSessionDto, type SelfServiceRole } from '@agregator/shared';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ExternalProvider, Prisma } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ACCOUNT_BLOCKED, AuthService } from '../auth/auth.service';
import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';
import {
  OAUTH_CONFIG,
  OAUTH_PROVIDER_TITLES,
  type OAuthConfig,
  type OAuthProviderConfig,
  type OAuthProviderId,
} from './oauth.config';
import { BankRequestError } from './oauth.http';
import { BANKS, BankAuthError, type BankProfile, displayName } from './oauth.providers';

/**
 * Коды ошибок входа через банк: web по ним выбирает, что показать человеку и куда его вернуть.
 * Сообщения — для людей; код — для программы.
 */
export type OAuthErrorCode =
  | 'OAUTH_DISABLED'
  | 'OAUTH_FAILED'
  | 'OAUTH_NO_EMAIL'
  | 'OAUTH_EMAIL_TAKEN'
  | 'OAUTH_NEED_ROLE'
  | 'OAUTH_PENDING_EXPIRED'
  | 'OAUTH_ALREADY_LINKED'
  | 'OAUTH_BLOCKED';

function oauthError(
  status: HttpStatus,
  code: OAuthErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): HttpException {
  return new HttpException({ statusCode: status, message, code, ...extra }, status);
}

const DB_PROVIDER: Record<OAuthProviderId, ExternalProvider> = {
  sber: ExternalProvider.SBER,
  tbank: ExternalProvider.TBANK,
};

/** Сколько живёт «незавершённый вход»: банк подтвердил человека, осталось выбрать роль. */
const PENDING_TTL_MS = 15 * 60 * 1000;
const FALLBACK_NAME = 'Пользователь';

interface PendingPayload {
  provider: OAuthProviderId;
  profile: BankProfile;
  /** Время истечения, мс. */
  exp: number;
}

export interface CodeInput {
  code: string;
  codeVerifier: string;
  nonce: string;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly pendingKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Inject(OAUTH_CONFIG) private readonly config: OAuthConfig,
  ) {
    // Ключ подписи незавершённого входа выводится из секретов банков: отдельная переменная не
    // нужна, а без настроенных банков подписывать нечего.
    this.pendingKey = createHmac('sha256', 'agregator-oauth-pending')
      .update(config.providers.map((p) => `${p.id}:${p.clientSecret}`).join('\n'))
      .digest();
  }

  /** Банки, вход через которые настроен на сервере (для кнопок на страницах входа). */
  providers(): { id: OAuthProviderId; title: string }[] {
    return this.config.providers.map((p) => ({ id: p.id, title: OAUTH_PROVIDER_TITLES[p.id] }));
  }

  authorizeUrl(
    id: string,
    params: { state: string; nonce: string; codeChallenge: string },
  ): { url: string } {
    const provider = this.provider(id);
    return {
      url: BANKS[provider.id].authorizeUrl(provider, {
        ...params,
        redirectUri: this.redirectUri(provider.id),
      }),
    };
  }

  /**
   * Вход или регистрация через банк. Уже привязанный аккаунт — вход. Новый человек с ролью —
   * аккаунт создаётся сразу; без роли — 409 OAUTH_NEED_ROLE с подписанным «незавершённым входом»
   * (pending), который web вернёт вместе с выбранной ролью в complete(). Аккаунт с тем же email
   * автоматически не привязывается: банк мог не подтвердить email, и это открыло бы чужой
   * аккаунт. Его владелец привязывает банк сам в настройках, войдя по паролю.
   */
  async signIn(
    id: string,
    input: CodeInput & { role?: SelfServiceRole },
    userAgent?: string,
  ): Promise<AuthSessionDto> {
    const provider = this.provider(id);
    const profile = await this.fetchProfile(provider, input);
    const existing = await this.findLinked(provider.id, profile.subject, userAgent);
    if (existing) return existing;
    // Без email аккаунт не создать: сказать сразу, а не после выбора роли.
    if (!profile.email) throw this.noEmail(provider.id);
    if (!input.role) {
      throw oauthError(
        HttpStatus.CONFLICT,
        'OAUTH_NEED_ROLE',
        'Аккаунта ещё нет: выберите, кто вы, чтобы его создать.',
        { pending: this.signPending(provider.id, profile), name: profile.name ?? null },
      );
    }
    return this.createAccount(provider.id, profile, input.role, userAgent);
  }

  /** Завершение входа после выбора роли (см. signIn). */
  async complete(
    pending: string,
    role: SelfServiceRole,
    userAgent?: string,
  ): Promise<AuthSessionDto> {
    const payload = this.verifyPending(pending);
    const existing = await this.findLinked(payload.provider, payload.profile.subject, userAgent);
    if (existing) return existing;
    return this.createAccount(payload.provider, payload.profile, role, userAgent);
  }

  /** Привязка банка к аккаунту, в который человек уже вошёл. */
  async link(userId: string, id: string, input: CodeInput): Promise<void> {
    const provider = this.provider(id);
    const profile = await this.fetchProfile(provider, input);
    try {
      await this.prisma.externalAccount.create({
        data: { provider: DB_PROVIDER[provider.id], subject: profile.subject, userId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const same = await this.prisma.externalAccount.findUnique({
          where: {
            provider_subject: { provider: DB_PROVIDER[provider.id], subject: profile.subject },
          },
        });
        if (same?.userId === userId) return;
        throw oauthError(
          HttpStatus.CONFLICT,
          'OAUTH_ALREADY_LINKED',
          same
            ? `Этот ${OAUTH_PROVIDER_TITLES[provider.id]} уже привязан к другому аккаунту.`
            : `К аккаунту уже привязан другой ${OAUTH_PROVIDER_TITLES[provider.id]}.`,
        );
      }
      throw error;
    }
  }

  async linked(userId: string): Promise<{ provider: OAuthProviderId; linkedAt: string }[]> {
    const rows = await this.prisma.externalAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      provider: row.provider === ExternalProvider.SBER ? 'sber' : 'tbank',
      linkedAt: row.createdAt.toISOString(),
    }));
  }

  private provider(id: string): OAuthProviderConfig {
    const provider = this.config.providers.find((p) => p.id === id);
    if (!provider || !this.config.redirectOrigin) {
      throw oauthError(
        HttpStatus.NOT_FOUND,
        'OAUTH_DISABLED',
        'Вход через этот банк не подключён.',
      );
    }
    return provider;
  }

  private redirectUri(id: OAuthProviderId): string {
    return `${this.config.redirectOrigin}/auth/${id}/callback`;
  }

  private async fetchProfile(
    provider: OAuthProviderConfig,
    input: CodeInput,
  ): Promise<BankProfile> {
    try {
      return await BANKS[provider.id].exchange(provider, {
        ...input,
        redirectUri: this.redirectUri(provider.id),
      });
    } catch (error) {
      if (error instanceof BankAuthError || error instanceof BankRequestError) {
        // Без кода и токенов в журнале: только банк и причина.
        this.logger.warn(`${provider.id}: ${error.message}`);
        throw oauthError(
          HttpStatus.BAD_GATEWAY,
          'OAUTH_FAILED',
          `Не удалось войти через ${OAUTH_PROVIDER_TITLES[provider.id]}. Попробуйте ещё раз.`,
        );
      }
      throw error;
    }
  }

  private async findLinked(
    provider: OAuthProviderId,
    subject: string,
    userAgent?: string,
  ): Promise<AuthSessionDto | null> {
    const account = await this.prisma.externalAccount.findUnique({
      where: { provider_subject: { provider: DB_PROVIDER[provider], subject } },
      include: { user: true },
    });
    if (!account) return null;
    // Сессия — под блокировкой строки пользователя, блокировка проверяется под ней же: иначе
    // сессия, созданная, пока администратор блокирует аккаунт, пережила бы блокировку (AUD-10).
    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ blocked_at: Date | null }[]>`
        SELECT blocked_at FROM users WHERE id = ${account.userId} FOR UPDATE`;
      if (!row || row.blocked_at) {
        throw oauthError(HttpStatus.FORBIDDEN, 'OAUTH_BLOCKED', ACCOUNT_BLOCKED);
      }
      return this.auth.createSession(tx, account.user, userAgent);
    });
  }

  private async createAccount(
    provider: OAuthProviderId,
    profile: BankProfile,
    role: SelfServiceRole,
    userAgent?: string,
  ): Promise<AuthSessionDto> {
    if (!profile.email) throw this.noEmail(provider);
    const email = profile.email;
    // Пароля у такого аккаунта нет: случайный хеш, который нельзя подобрать. Вход — через банк.
    const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            name: profile.name ?? displayName([FALLBACK_NAME])!,
            role,
            phone: profile.phone ?? null,
          },
        });
        await tx.externalAccount.create({
          data: { provider: DB_PROVIDER[provider], subject: profile.subject, userId: user.id },
        });
        return this.auth.createSession(tx, user, userAgent);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '');
        if (target.includes('email')) {
          throw oauthError(
            HttpStatus.CONFLICT,
            'OAUTH_EMAIL_TAKEN',
            `Аккаунт с email ${email} уже есть. Войдите по паролю и привяжите ${OAUTH_PROVIDER_TITLES[provider]} в настройках.`,
          );
        }
        // Тот же человек вошёл одновременно в двух вкладках: аккаунт уже создан другой.
        const existing = await this.findLinked(provider, profile.subject, userAgent);
        if (existing) return existing;
      }
      throw error;
    }
  }

  private noEmail(provider: OAuthProviderId): HttpException {
    return oauthError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'OAUTH_NO_EMAIL',
      `${OAUTH_PROVIDER_TITLES[provider]} не передал email. Зарегистрируйтесь по email и паролю.`,
    );
  }

  private signPending(provider: OAuthProviderId, profile: BankProfile): string {
    const payload: PendingPayload = { provider, profile, exp: Date.now() + PENDING_TTL_MS };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  private verifyPending(token: string): PendingPayload {
    const expired = oauthError(
      HttpStatus.GONE,
      'OAUTH_PENDING_EXPIRED',
      'Время на завершение входа вышло. Войдите через банк ещё раз.',
    );
    const [body, signature] = token.split('.');
    if (!body || !signature) throw expired;
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw expired;
    let payload: PendingPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PendingPayload;
    } catch {
      throw expired;
    }
    if (!(payload.exp > Date.now())) throw expired;
    // Банк могли отключить, пока человек выбирал роль: такой вход тоже не завершить.
    if (!this.config.providers.some((p) => p.id === payload.provider)) throw expired;
    return payload;
  }

  private sign(body: string): string {
    return createHmac('sha256', this.pendingKey).update(body).digest('base64url');
  }
}
