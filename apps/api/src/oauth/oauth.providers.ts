import { AUTH_LIMITS } from '@agregator/shared';
import type { OAuthProviderConfig } from './oauth.config';
import { bankRequest, requestId } from './oauth.http';

/** Что банк сообщил о человеке. Пустые поля — банк их не отдал или человек не разрешил. */
export interface BankProfile {
  /** Постоянный идентификатор человека у банка (sub). */
  subject: string;
  email?: string;
  name?: string;
  /** +7XXXXXXXXXX */
  phone?: string;
}

export class BankAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BankAuthError';
  }
}

export interface AuthorizeParams {
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

export interface ExchangeParams {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  nonce: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Управляющие и невидимые символы (как в проверке имени при регистрации). */
const CONTROL_RE = /\p{C}/gu;

const text = (raw: unknown): string | undefined =>
  typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;

export function normalizeEmail(raw: unknown): string | undefined {
  const email = text(raw)?.toLowerCase();
  return email && email.length <= AUTH_LIMITS.EMAIL_MAX && EMAIL_RE.test(email) ? email : undefined;
}

/** Российский мобильный в любом виде (79991234567, +7 (999) 123-45-67, 8999…) → +7XXXXXXXXXX. */
export function normalizePhone(raw: unknown): string | undefined {
  const digits =
    typeof raw === 'string' || typeof raw === 'number' ? String(raw).replace(/\D/g, '') : '';
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8'))
    return `+7${digits.slice(1)}`;
  if (digits.length === 10 && digits[0] === '9') return `+7${digits}`;
  return undefined;
}

export function displayName(parts: unknown[]): string | undefined {
  const name = parts
    .map((part) => text(part)?.replace(CONTROL_RE, ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AUTH_LIMITS.NAME_MAX)
    .trim();
  return name.length >= AUTH_LIMITS.NAME_MIN ? name : undefined;
}

function subjectOf(raw: unknown): string {
  const subject = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  if (!subject || subject.length > 255) throw new BankAuthError('bank returned no user id (sub)');
  return subject;
}

/** Полезная нагрузка JWT без проверки подписи: токен получен сервером напрямую от банка. */
function jwtPayload(token: unknown): Record<string, unknown> | undefined {
  if (typeof token !== 'string') return undefined;
  const part = token.split('.')[1];
  if (!part) return undefined;
  try {
    const payload: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function accessTokenOf(status: number, body: unknown): string {
  const token = record(body).access_token;
  if (status !== 200 || typeof token !== 'string' || !token) {
    throw new BankAuthError(`token request failed with ${status}`);
  }
  return token;
}

/**
 * Сбер ID (developers.sber.ru/docs/ru/sberid): код авторизации с PKCE, обмен на токены по mTLS,
 * проверка aud и nonce в id_token, данные человека из userinfo и обязательное уведомление
 * auth/completed после успешного входа.
 */
const sber = {
  authorizeUrl(config: OAuthProviderConfig, params: AuthorizeParams): string {
    const url = new URL(config.authorizeUrl);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_type: 'PRIVATE',
      client_id: config.clientId,
      scope: config.scope,
      state: params.state,
      nonce: params.nonce,
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  },

  async exchange(config: OAuthProviderConfig, params: ExchangeParams): Promise<BankProfile> {
    const token = await bankRequest({
      url: config.tokenUrl,
      method: 'POST',
      tls: config.tls,
      headers: { rquid: requestId(), 'x-ibm-client-id': config.clientId },
      form: {
        grant_type: 'authorization_code',
        code: params.code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: params.redirectUri,
        code_verifier: params.codeVerifier,
      },
    });
    const accessToken = accessTokenOf(token.status, token.body);
    // Сбер всегда отдаёт id_token (OIDC): без него nonce не проверить, вход не принимается.
    const claims = jwtPayload(record(token.body).id_token);
    if (!claims) throw new BankAuthError('no id_token in token response');
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(config.clientId)) throw new BankAuthError('id_token aud mismatch');
    if (claims.nonce !== params.nonce) throw new BankAuthError('id_token nonce mismatch');

    const info = await bankRequest({
      url: config.userinfoUrl,
      method: 'GET',
      tls: config.tls,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-introspect-rquid': requestId(),
        'x-ibm-client-id': config.clientId,
      },
    });
    if (info.status !== 200) throw new BankAuthError(`userinfo failed with ${info.status}`);
    const user = record(info.body);
    const subject = subjectOf(user.sub ?? claims.sub);
    if (claims.sub !== undefined && String(claims.sub) !== subject) {
      throw new BankAuthError('userinfo sub differs from id_token sub');
    }

    if (config.completedUrl) {
      // Уведомление Сбера об успешном входе: без него вход работает, поэтому сбой не мешает.
      await bankRequest({
        url: config.completedUrl,
        method: 'GET',
        tls: config.tls,
        headers: { Authorization: `Bearer ${accessToken}`, rquid: requestId() },
      }).catch(() => undefined);
    }

    return {
      subject,
      email: normalizeEmail(user.email),
      name: displayName([user.given_name, user.family_name]),
      phone: normalizePhone(user.phone_number),
    };
  },
};

/**
 * Т-Банк ID (developer.tbank.ru/docs/products/TID): код авторизации, обмен на токен с Basic-
 * аутентификацией, данные человека из userinfo (client_id и client_secret в теле запроса).
 * PKCE у T-ID описан только для приложений, поэтому не передаётся.
 */
const tbank = {
  authorizeUrl(config: OAuthProviderConfig, params: AuthorizeParams): string {
    const url = new URL(config.authorizeUrl);
    const query: Record<string, string> = {
      client_id: config.clientId,
      redirect_uri: params.redirectUri,
      state: params.state,
      response_type: 'code',
    };
    if (config.scope) query.scope = config.scope;
    url.search = new URLSearchParams(query).toString();
    return url.toString();
  },

  async exchange(config: OAuthProviderConfig, params: ExchangeParams): Promise<BankProfile> {
    const basic = Buffer.from(
      `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`,
    ).toString('base64');
    const token = await bankRequest({
      url: config.tokenUrl,
      method: 'POST',
      tls: config.tls,
      headers: { Authorization: `Basic ${basic}` },
      form: {
        grant_type: 'authorization_code',
        code: params.code,
        redirect_uri: params.redirectUri,
      },
    });
    const accessToken = accessTokenOf(token.status, token.body);
    const info = await bankRequest({
      url: config.userinfoUrl,
      method: 'POST',
      tls: config.tls,
      headers: { Authorization: `Bearer ${accessToken}` },
      form: { client_id: config.clientId, client_secret: config.clientSecret },
    });
    if (info.status !== 200) throw new BankAuthError(`userinfo failed with ${info.status}`);
    const user = record(info.body);
    return {
      subject: subjectOf(user.sub),
      email: normalizeEmail(user.email),
      name: displayName([user.given_name, user.family_name]) ?? displayName([user.name]),
      phone: normalizePhone(user.phone_number),
    };
  },
};

export const BANKS = { sber, tbank } as const;
