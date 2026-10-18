import 'server-only';
import { SELF_SERVICE_ROLES } from '@agregator/shared';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { BankId } from './api';

/**
 * Вход через банк (Сбер ID, Т-Банк ID), сторона web. Человек уходит в банк по адресу от API
 * (/auth/{банк}/start) и возвращается на /auth/{банк}/callback с кодом. До возврата web хранит в
 * короткой HttpOnly-cookie state (защита от подмены входа), nonce и PKCE-verifier; код он
 * передаёт API, который один знает секреты банка. Если аккаунта ещё нет и роль не выбрана,
 * подписанный API «незавершённый вход» ждёт в другой cookie, пока человек выберет роль.
 */

export const BANK_IDS: readonly BankId[] = ['sber', 'tbank'];
export const BANK_TITLES: Record<BankId, string> = { sber: 'Сбер ID', tbank: 'Т-Банк ID' };

export const isBankId = (value: unknown): value is BankId =>
  typeof value === 'string' && (BANK_IDS as readonly string[]).includes(value);

export type BankMode = 'login' | 'link';

export interface BankFlow {
  bank: BankId;
  mode: BankMode;
  state: string;
  nonce: string;
  verifier: string;
  /** Роль для нового аккаунта (кнопка на странице регистрации). */
  role?: string;
  /** Куда вернуть после входа (уже проверенный относительный путь). */
  next: string;
}

/** Сколько ждём возврата из банка. */
const FLOW_TTL_S = 10 * 60;
/** Сколько ждём выбора роли после банка (как в API). */
const PENDING_TTL_S = 15 * 60;

const production = () => process.env.NODE_ENV === 'production';
const flowCookie = () => (production() ? '__Host-ar_bank' : 'ar_bank');
const pendingCookie = () => (production() ? '__Host-ar_bank_pending' : 'ar_bank_pending');

/**
 * SameSite=Lax: cookie приходит при возврате из банка (переход верхнего уровня GET с чужого
 * сайта), но не уходит с фоновыми запросами чужих сайтов.
 */
function attributes(maxAge: number) {
  return { httpOnly: true, secure: production(), sameSite: 'lax' as const, path: '/', maxAge };
}

const random = (bytes: number) => randomBytes(bytes).toString('base64url');

export function isSelfServiceRole(value: unknown): value is string {
  return typeof value === 'string' && (SELF_SERVICE_ROLES as readonly string[]).includes(value);
}

/** Новый вход: случайные state, nonce, PKCE-verifier и challenge (S256). */
export function newBankFlow(
  bank: BankId,
  mode: BankMode,
  next: string,
  role?: string,
): { flow: BankFlow; codeChallenge: string } {
  const verifier = random(48);
  const flow: BankFlow = {
    bank,
    mode,
    state: random(24),
    nonce: random(24),
    verifier,
    next,
    ...(isSelfServiceRole(role) ? { role } : {}),
  };
  return {
    flow,
    codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}

export async function saveBankFlow(flow: BankFlow): Promise<void> {
  const value = Buffer.from(JSON.stringify(flow)).toString('base64url');
  (await cookies()).set(flowCookie(), value, attributes(FLOW_TTL_S));
}

/** Сохранённый вход; cookie сразу удаляется: каждый state годится один раз. */
export async function takeBankFlow(): Promise<BankFlow | null> {
  const jar = await cookies();
  const raw = jar.get(flowCookie())?.value;
  jar.set(flowCookie(), '', attributes(0));
  if (!raw) return null;
  try {
    const flow = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<BankFlow>;
    if (
      !isBankId(flow.bank) ||
      (flow.mode !== 'login' && flow.mode !== 'link') ||
      typeof flow.state !== 'string' ||
      typeof flow.nonce !== 'string' ||
      typeof flow.verifier !== 'string' ||
      typeof flow.next !== 'string'
    ) {
      return null;
    }
    return flow as BankFlow;
  } catch {
    return null;
  }
}

export function stateMatches(expected: string, given: string | null): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function saveBankPending(pending: string): Promise<void> {
  (await cookies()).set(pendingCookie(), pending, attributes(PENDING_TTL_S));
}

export async function readBankPending(): Promise<string | undefined> {
  return (await cookies()).get(pendingCookie())?.value;
}

export async function clearBankPending(): Promise<void> {
  (await cookies()).set(pendingCookie(), '', attributes(0));
}

/**
 * Банк и имя из незавершённого входа — только для текста на странице («Вы вошли через Сбер ID
 * как Иван»). Подпись проверяет API при завершении, здесь данным не доверяем.
 */
export function describePending(pending: string): { bank: BankId; name?: string } | null {
  try {
    const payload = JSON.parse(
      Buffer.from(pending.split('.')[0] ?? '', 'base64url').toString('utf8'),
    ) as { provider?: unknown; profile?: { name?: unknown } };
    if (!isBankId(payload.provider)) return null;
    const name = typeof payload.profile?.name === 'string' ? payload.profile.name : undefined;
    return { bank: payload.provider, name };
  } catch {
    return null;
  }
}

/** Код ошибки в адресе страницы (?bank_error=) → текст для человека. */
export function bankErrorMessage(code: string | undefined, bank?: BankId): string | undefined {
  const title = bank ? BANK_TITLES[bank] : 'банк';
  switch (code) {
    case undefined:
      return undefined;
    case 'cancelled':
      return `Вход через ${title} отменён.`;
    case 'disabled':
      return `Вход через ${title} пока не подключён.`;
    case 'expired':
      return 'Время на вход вышло. Нажмите кнопку банка ещё раз.';
    case 'email-taken':
      return `Аккаунт с таким email уже есть. Войдите по паролю, затем привяжите ${title} в настройках.`;
    case 'no-email':
      return `${title} не передал email. Зарегистрируйтесь по email и паролю.`;
    case 'already-linked':
      return `Этот ${title} уже привязан к другому аккаунту.`;
    case 'rate-limited':
      return 'Слишком много попыток. Подождите минуту и попробуйте снова.';
    default:
      return `Не удалось войти через ${title}. Попробуйте ещё раз или войдите по email.`;
  }
}

/** Код API (OAUTH_*) → код для адреса страницы. */
export function bankErrorCode(apiCode: string | undefined, status?: number): string {
  if (status === 429) return 'rate-limited';
  switch (apiCode) {
    case 'OAUTH_DISABLED':
      return 'disabled';
    case 'OAUTH_EMAIL_TAKEN':
      return 'email-taken';
    case 'OAUTH_NO_EMAIL':
      return 'no-email';
    case 'OAUTH_ALREADY_LINKED':
      return 'already-linked';
    case 'OAUTH_PENDING_EXPIRED':
      return 'expired';
    default:
      return 'failed';
  }
}
