import 'server-only';
import type { UserDto } from '@agregator/shared';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { getMe, logoutSession } from './api';
import { clientIpFromForwardedFor, parseTrustProxyHops } from './client-ip';

/**
 * В production cookie с префиксом __Host-: только HTTPS, только этот хост, путь /.
 * Токен недоступен JavaScript (HttpOnly) и не уходит на сторонние сайты (SameSite=Lax).
 */
export function sessionCookieName(): string {
  return process.env.NODE_ENV === 'production' ? '__Host-ar_session' : 'ar_session';
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(sessionCookieName())?.value;
}

function cookieAttributes() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

/**
 * Новая сессия после входа или регистрации. Прежняя сессия этого браузера (повторный вход, в том
 * числе под другим аккаунтом) отзывается в API, а не просто затирается в cookie: иначе её токен
 * жил бы ещё 30 дней (AUDIT_FINDINGS SEC-4). Сбой отзыва вход не прерывает.
 */
export async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  const previous = await getSessionToken();
  if (previous && previous !== token) await logoutSession(previous);
  (await cookies()).set(sessionCookieName(), token, {
    ...cookieAttributes(),
    expires: new Date(expiresAt),
  });
}

/**
 * Удаление теми же атрибутами, что и установка: браузер отвергает Set-Cookie для __Host-
 * без Secure, и cookie.delete() без атрибутов оставил бы её в браузере.
 */
export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(sessionCookieName(), '', { ...cookieAttributes(), maxAge: 0 });
}

export type SessionState =
  | { kind: 'anonymous' }
  | { kind: 'user'; user: UserDto; token: string }
  /** API не ответил (сбой, таймаут): неизвестно, есть ли сессия. Это не повод выходить. */
  | { kind: 'unavailable' };

/**
 * Сессия посетителя (один запрос к API на рендер). Нет cookie или API ответил 401 — anonymous;
 * сбой API — unavailable: страницы кабинета показывают «сервис недоступен», а не вход
 * (AUDIT_FINDINGS ARCH-3).
 */
export const getSessionState = cache(async (): Promise<SessionState> => {
  const token = await getSessionToken();
  if (!token) return { kind: 'anonymous' };
  try {
    const user = await getMe(token);
    return user ? { kind: 'user', user, token } : { kind: 'anonymous' };
  } catch (error) {
    console.error('Session: failed to load current user', error);
    return { kind: 'unavailable' };
  }
});

/** Текущий пользователь или null (нет сессии или API недоступен): для шапки и оформления. */
export const getCurrentUser = cache(async (): Promise<UserDto | null> => {
  const session = await getSessionState();
  return session.kind === 'user' ? session.user : null;
});

/** IP посетителя с учётом доверенных прокси перед web (WEB_TRUST_PROXY_HOPS, docs/DEPLOYMENT.md). */
export async function getClientIp(): Promise<string | undefined> {
  const hops = parseTrustProxyHops(process.env.WEB_TRUST_PROXY_HOPS);
  return clientIpFromForwardedFor((await headers()).get('x-forwarded-for'), hops);
}

/** User-Agent браузера для подписи устройства в списке входов (не для безопасности). */
export async function getUserAgent(): Promise<string | undefined> {
  return (await headers()).get('user-agent') ?? undefined;
}
