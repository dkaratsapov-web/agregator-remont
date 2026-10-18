import { readFileSync } from 'node:fs';
import { rootCertificates } from 'node:tls';

/** Банки, через которые можно войти. Значения совпадают с enum ExternalProvider в базе. */
export const OAUTH_PROVIDER_IDS = ['sber', 'tbank'] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

export const OAUTH_PROVIDER_TITLES: Record<OAuthProviderId, string> = {
  sber: 'Сбер ID',
  tbank: 'Т-Банк ID',
};

/** Клиентский сертификат для mTLS (Сбер ID выдаёт .p12) и дополнительный корневой УЦ. */
export interface OAuthTls {
  pfx: Buffer;
  passphrase?: string;
  /** Корневые сертификаты: системные плюс сертификат УЦ Минцифры, которым подписан oauth.sber.ru. */
  ca?: string[];
}

export interface OAuthProviderConfig {
  id: OAuthProviderId;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  /** Сбер ID: обязательное уведомление об успешном входе (только прод). */
  completedUrl?: string;
  /** Пусто — параметр scope не передаётся (у Т-Банк ID набор данных задаётся при подключении). */
  scope: string;
  tls?: OAuthTls;
}

export interface OAuthConfig {
  /**
   * Адрес сайта, на который банк возвращает человека: {origin}/auth/{банк}/callback. Тот же адрес
   * регистрируется у банка. Кириллический домен переводится в punycode (xn--…).
   */
  redirectOrigin?: string;
  providers: OAuthProviderConfig[];
}

export const OAUTH_CONFIG = Symbol('OAUTH_CONFIG');

const SBER_DEFAULTS = {
  authorizeUrl: 'https://id.sber.ru/CSAFront/oidc/authorize.do',
  tokenUrl: 'https://oauth.sber.ru/ru/prod/tokens/v2/oidc',
  userinfoUrl: 'https://oauth.sber.ru/ru/prod/sberbankid/v2.1/userinfo',
  completedUrl: 'https://oauth.sber.ru/api/v2/auth/completed',
  scope: 'openid name email mobile',
};

const TBANK_DEFAULTS = {
  authorizeUrl: 'https://id.tbank.ru/auth/authorize',
  tokenUrl: 'https://id.tbank.ru/auth/token',
  userinfoUrl: 'https://id.tbank.ru/userinfo/userinfo',
  scope: '',
};

function value(source: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = source[name]?.trim();
  return raw ? raw : undefined;
}

function httpsUrl(raw: string, name: string, production: boolean): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name}: "${raw}" is not a valid URL`);
  }
  if (url.protocol !== 'https:' && (production || url.protocol !== 'http:')) {
    throw new Error(`${name} must use https${production ? ' in production' : ' or http'}`);
  }
  return url.toString();
}

function readTls(source: NodeJS.ProcessEnv, prefix: string): OAuthTls | undefined {
  const certPath = value(source, `${prefix}_CERT_PATH`);
  if (!certPath) return undefined;
  const caPath = value(source, `${prefix}_CA_PATH`);
  return {
    pfx: readFileSync(certPath),
    passphrase: value(source, `${prefix}_CERT_PASSWORD`),
    ca: caPath ? [...rootCertificates, readFileSync(caPath, 'utf8')] : undefined,
  };
}

/**
 * Вход через банк включается, когда заданы client_id и client_secret банка (и для Сбер ID в
 * production — клиентский сертификат). Адреса банка можно переопределить: тестовый контур
 * Сбера (id-ift.sber.ru) и e2e-тесты с поддельным банком. При ошибке настройки API не стартует.
 */
export function loadOAuthConfig(source: NodeJS.ProcessEnv = process.env): OAuthConfig {
  const production = source.NODE_ENV === 'production';
  const providers: OAuthProviderConfig[] = [];

  const add = (
    id: OAuthProviderId,
    prefix: string,
    defaults: typeof SBER_DEFAULTS | typeof TBANK_DEFAULTS,
  ) => {
    const clientId = value(source, `${prefix}_CLIENT_ID`);
    const clientSecret = value(source, `${prefix}_CLIENT_SECRET`);
    if (!clientId && !clientSecret) return;
    if (!clientId || !clientSecret) {
      throw new Error(`${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET must be set together`);
    }
    const url = (key: 'authorizeUrl' | 'tokenUrl' | 'userinfoUrl', env: string) =>
      httpsUrl(value(source, `${prefix}_${env}`) ?? defaults[key], `${prefix}_${env}`, production);
    const completed =
      'completedUrl' in defaults
        ? httpsUrl(
            value(source, `${prefix}_COMPLETED_URL`) ?? defaults.completedUrl,
            `${prefix}_COMPLETED_URL`,
            production,
          )
        : undefined;
    const tls = readTls(source, prefix);
    if (id === 'sber' && production && !tls) {
      throw new Error(
        'SBER_ID_CERT_PATH is required in production: Sber ID needs a client certificate',
      );
    }
    providers.push({
      id,
      clientId,
      clientSecret,
      authorizeUrl: url('authorizeUrl', 'AUTHORIZE_URL'),
      tokenUrl: url('tokenUrl', 'TOKEN_URL'),
      userinfoUrl: url('userinfoUrl', 'USERINFO_URL'),
      completedUrl: completed,
      scope: value(source, `${prefix}_SCOPE`) ?? defaults.scope,
      tls,
    });
  };

  add('sber', 'SBER_ID', SBER_DEFAULTS);
  add('tbank', 'TBANK_ID', TBANK_DEFAULTS);

  const rawOrigin = value(source, 'OAUTH_REDIRECT_ORIGIN');
  let redirectOrigin: string | undefined;
  if (rawOrigin) {
    const url = new URL(httpsUrl(rawOrigin, 'OAUTH_REDIRECT_ORIGIN', production));
    redirectOrigin = url.origin;
  }
  if (providers.length > 0 && !redirectOrigin) {
    throw new Error(
      'OAUTH_REDIRECT_ORIGIN is required when bank login (SBER_ID_*, TBANK_ID_*) is set',
    );
  }
  return { redirectOrigin, providers };
}
