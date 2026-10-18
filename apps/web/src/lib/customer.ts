import 'server-only';
import type { UserDto, UserRole } from '@agregator/shared';
import { redirect } from 'next/navigation';
import { getCurrentUser, getSessionToken } from './session';

type RolePage = { user: UserDto; token: string } | { user: UserDto; token: null };

/**
 * Для страниц кабинета: без сессии — на вход, другая роль — token: null (страница
 * показывает пояснение). Это только UX: права проверяет API на каждом запросе.
 */
export async function requireRolePage(role: UserRole, next: string): Promise<RolePage> {
  const [user, token] = await Promise.all([getCurrentUser(), getSessionToken()]);
  if (!user || !token) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user.role === role ? { user, token } : { user, token: null };
}

export const requireCustomerPage = (next: string) => requireRolePage('CUSTOMER', next);
export const requireContractorPage = (next: string) => requireRolePage('CONTRACTOR', next);
export const requireAdminPage = (next: string) => requireRolePage('ADMIN', next);
