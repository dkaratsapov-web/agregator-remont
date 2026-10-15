import 'server-only';
import type { UserDto } from '@agregator/shared';
import { redirect } from 'next/navigation';
import { getCurrentUser, getSessionToken } from './session';

/**
 * Для страниц кабинета заказчика: без сессии — на вход, другая роль — null (страница
 * показывает пояснение). Это только UX: права проверяет API на каждом запросе.
 */
export async function requireCustomerPage(
  next: string,
): Promise<{ user: UserDto; token: string } | { user: UserDto; token: null }> {
  const [user, token] = await Promise.all([getCurrentUser(), getSessionToken()]);
  if (!user || !token) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user.role === 'CUSTOMER' ? { user, token } : { user, token: null };
}
