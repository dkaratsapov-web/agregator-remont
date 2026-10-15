export type TrustProxy = false | number | string[];

export interface AppEnv {
  port: number;
  corsOrigins: string[];
  trustProxy: TrustProxy;
  databaseUrl: string;
}

const MAX_PROXY_HOPS = 10;

/**
 * Каждый элемент CORS_ORIGINS должен быть точным origin (схема + хост + порт, без пути).
 * Пустой список означает «браузерам с других origin запрещено всё»: web обращается к API
 * с сервера, поэтому CORS ему не нужен. В production разрешён только https.
 */
function parseCorsOrigins(raw: string | undefined, production: boolean): string[] {
  const origins = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('CORS_ORIGINS must list explicit origins, "*" is not allowed');
    }
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGINS: "${origin}" is not a valid origin`);
    }
    if (url.origin !== origin) {
      throw new Error(
        `CORS_ORIGINS: "${origin}" must be a bare origin like https://example.ru (no path or trailing slash)`,
      );
    }
    if (url.protocol !== 'https:' && (production || url.protocol !== 'http:')) {
      throw new Error(
        `CORS_ORIGINS: "${origin}" must use https${production ? ' in production' : ' or http'}`,
      );
    }
  }
  return origins;
}

/**
 * TRUST_PROXY настраивает Express `trust proxy`, от которого зависят req.ip и rate limit.
 * Не задан: заголовки X-Forwarded-* игнорируются (API смотрит в интернет напрямую).
 * Число: сколько доверенных прокси стоит перед API. Список: адреса/подсети прокси.
 * Значение true запрещено: оно позволяет клиенту подделать свой IP через X-Forwarded-For.
 */
function parseTrustProxy(raw: string | undefined): TrustProxy {
  const value = raw?.trim();
  if (!value || value === 'false') return false;
  if (value === 'true') {
    throw new Error('TRUST_PROXY=true trusts any client; use a hop count or a list of proxies');
  }
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (hops < 1 || hops > MAX_PROXY_HOPS) {
      throw new Error(`TRUST_PROXY hop count must be 1..${MAX_PROXY_HOPS}`);
    }
    return hops;
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Читает и проверяет переменные окружения; при ошибке приложение не стартует. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const production = source.NODE_ENV === 'production';

  const databaseUrl = source.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const port = Number(source.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`API_PORT must be an integer 1..65535, got "${source.API_PORT}"`);
  }

  return {
    port,
    corsOrigins: parseCorsOrigins(source.CORS_ORIGINS, production),
    trustProxy: parseTrustProxy(source.TRUST_PROXY),
    databaseUrl,
  };
}

export interface RateLimits {
  /** Общий лимит запросов в минуту на IP. */
  perMinute: number;
  /** Лимит на вход и регистрацию в минуту на IP. */
  authPerMinute: number;
}

function parseLimit(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100_000) {
    throw new Error(`${name} must be an integer 1..100000, got "${raw}"`);
  }
  return value;
}

export function loadRateLimits(source: NodeJS.ProcessEnv = process.env): RateLimits {
  return {
    perMinute: parseLimit(source.RATE_LIMIT_PER_MIN, 'RATE_LIMIT_PER_MIN', 120),
    authPerMinute: parseLimit(source.AUTH_RATE_LIMIT_PER_MIN, 'AUTH_RATE_LIMIT_PER_MIN', 10),
  };
}
