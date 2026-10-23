import 'server-only';
import { cookies } from 'next/headers';

/**
 * Ссылка для нового пароля `/reset/<токен>` сразу переносит токен в cookie и уводит на `/reset`:
 * токен не остаётся в адресной строке, истории и заголовке Referer. Cookie живёт полчаса,
 * HttpOnly; сама ссылка действует сутки и один раз (проверяет API).
 */
const TTL_S = 30 * 60;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const production = () => process.env.NODE_ENV === 'production';
const cookieName = () => (production() ? '__Host-ar_reset' : 'ar_reset');
const attributes = (maxAge: number) => ({
  httpOnly: true,
  secure: production(),
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});

export const isResetToken = (value: string): boolean => TOKEN.test(value);

export async function saveResetToken(token: string): Promise<void> {
  (await cookies()).set(cookieName(), token, attributes(TTL_S));
}

export async function readResetToken(): Promise<string | undefined> {
  const value = (await cookies()).get(cookieName())?.value;
  return value && isResetToken(value) ? value : undefined;
}

export async function clearResetToken(): Promise<void> {
  (await cookies()).set(cookieName(), '', attributes(0));
}
