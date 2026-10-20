import 'server-only';
import type { UserDto, UserRole } from '@agregator/shared';
import { redirect } from 'next/navigation';
import { getSessionState } from './session';

type RolePage = { user: UserDto; token: string } | { user: UserDto; token: null };

/** Сбой API при проверке сессии: страницу показывает граница ошибок «Сервис недоступен». */
export class SessionCheckUnavailableError extends Error {
  constructor() {
    super('API unavailable: the session could not be checked');
    this.name = 'SessionCheckUnavailableError';
  }
}

/**
 * Для страниц кабинета: без сессии — на вход. Сбой API — ошибка (граница ошибок предлагает
 * повторить), а не вход: человек не вышел, просто API не ответил (AUDIT_FINDINGS ARCH-3).
 */
export async function requireUserPage(next: string): Promise<{ user: UserDto; token: string }> {
  const session = await getSessionState();
  if (session.kind === 'unavailable') throw new SessionCheckUnavailableError();
  if (session.kind === 'anonymous') redirect(`/login?next=${encodeURIComponent(next)}`);
  return { user: session.user, token: session.token };
}

/**
 * Для страниц роли: другая роль — token: null (страница показывает пояснение). Это только UX:
 * права проверяет API на каждом запросе.
 */
export async function requireRolePage(role: UserRole, next: string): Promise<RolePage> {
  const { user, token } = await requireUserPage(next);
  return user.role === role ? { user, token } : { user, token: null };
}

export const requireCustomerPage = (next: string) => requireRolePage('CUSTOMER', next);
export const requireContractorPage = (next: string) => requireRolePage('CONTRACTOR', next);
export const requireAdminPage = (next: string) => requireRolePage('ADMIN', next);
