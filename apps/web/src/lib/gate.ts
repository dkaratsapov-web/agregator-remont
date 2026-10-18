import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * Вход для тестировщиков на время закрытого теста (deploy/Caddyfile, docs/SECURITY.md, раздел 8).
 *
 * Вместо системного окна браузера (basic auth) — своя страница /gate. Caddy перед каждым
 * запросом в закрытую часть спрашивает web (/gate/check, forward_auth): есть ли у посетителя
 * пропуск. Пропуск — cookie «срок.подпись» с HMAC; ключ выводится из BASIC_AUTH_HASH, поэтому
 * смена пароля тестировщика сразу отзывает все выданные пропуска. Логин и пароль те же, что
 * были у basic auth (BASIC_AUTH_USER и bcrypt-хеш BASIC_AUTH_HASH из deploy/.env).
 */

/** Пропуск действует 30 дней, потом страница входа спросит пароль снова. */
export const GATE_TTL_SECONDS = 30 * 24 * 60 * 60;

const PASS_VERSION = 'v1';

export function gateCookieName(): string {
  return process.env.NODE_ENV === 'production' ? '__Host-ar_gate' : 'ar_gate';
}

export interface GateConfig {
  user: string;
  hash: string;
}

/** Логин и хеш пароля из окружения; null — вход не настроен, и закрытая часть закрыта для всех. */
export function gateConfig(
  env: Record<string, string | undefined> = process.env,
): GateConfig | null {
  const user = env.BASIC_AUTH_USER?.trim();
  const hash = env.BASIC_AUTH_HASH?.trim();
  if (!user || !hash || !/^\$2[aby]\$\d{2}\$.{53}$/.test(hash)) return null;
  return { user, hash };
}

function passKey(config: GateConfig): Buffer {
  return createHmac('sha256', config.hash).update('agregator-gate-pass').digest();
}

function sign(config: GateConfig, payload: string): string {
  return createHmac('sha256', passKey(config)).update(payload).digest('base64url');
}

/** Новый пропуск: «v1.<срок в секундах>.<подпись>». */
export function issueGatePass(config: GateConfig, nowMs = Date.now()): string {
  const payload = `${PASS_VERSION}.${Math.floor(nowMs / 1000) + GATE_TTL_SECONDS}`;
  return `${payload}.${sign(config, payload)}`;
}

/** Подпись совпадает и срок не истёк. */
export function isValidGatePass(
  config: GateConfig | null,
  value: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!config || !value || value.length > 200) return false;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== PASS_VERSION || !/^\d{1,12}$/.test(parts[1])) return false;
  const expected = Buffer.from(sign(config, `${parts[0]}.${parts[1]}`));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  return Number(parts[1]) * 1000 > nowMs;
}

/**
 * Открытие страницы в браузере, а не фоновый запрос (по заголовкам, которые Caddy пересылает
 * в /gate/check). Только такой запрос без пропуска уводится на /gate.
 */
export function isPageNavigation(headers: Headers): boolean {
  const method = headers.get('x-forwarded-method') ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (headers.get('rsc') !== null || headers.get('next-router-prefetch') !== null) return false;
  const mode = headers.get('sec-fetch-mode');
  if (mode) return mode === 'navigate';
  return headers.get('accept')?.includes('text/html') ?? false;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Логин сравнивается за постоянное время, пароль — через bcrypt (медленно намеренно). */
export async function checkGateCredentials(
  config: GateConfig,
  login: string,
  password: string,
): Promise<boolean> {
  const loginOk = timingSafeEqual(digest(login), digest(config.user));
  const passwordOk =
    password.length > 0 && password.length <= 256
      ? await bcrypt.compare(password, config.hash)
      : false;
  return loginOk && passwordOk;
}

/**
 * Лимит неудачных попыток на IP: 10 за 15 минут. Хранится в памяти процесса web (он один);
 * при перезапуске счётчики сбрасываются, это допустимо — bcrypt и так замедляет перебор.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const MAX_TRACKED = 10_000;
const failures = new Map<string, { count: number; resetAt: number }>();

export function isGateLocked(ip: string, nowMs = Date.now()): boolean {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (entry.resetAt <= nowMs) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function recordGateFailure(ip: string, nowMs = Date.now()): void {
  const entry = failures.get(ip);
  if (entry && entry.resetAt > nowMs) {
    entry.count += 1;
    return;
  }
  if (failures.size >= MAX_TRACKED) {
    for (const [key, value] of failures) if (value.resetAt <= nowMs) failures.delete(key);
    if (failures.size >= MAX_TRACKED) failures.delete(failures.keys().next().value as string);
  }
  failures.set(ip, { count: 1, resetAt: nowMs + WINDOW_MS });
}

export function resetGateFailures(ip: string): void {
  failures.delete(ip);
}
