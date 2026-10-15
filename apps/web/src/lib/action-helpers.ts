import 'server-only';
import { redirect } from 'next/navigation';
import { ApiError } from './api';
import { getSessionToken } from './session';

/** Идентификатор в том же формате, что проверяет API; иначе запрос не отправляется. */
export const isEntityId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

/** Сессия обязательна; авторизацию (роль, владелец) выполняет API по этой сессии. */
export async function requireSessionToken(next: string): Promise<string> {
  const token = await getSessionToken();
  if (!token) redirect(`/login?next=${encodeURIComponent(next)}`);
  return token;
}

/** Истёкшая сессия → на вход с возвратом. */
export function redirectIfUnauthorized(error: unknown, next: string): void {
  if (error instanceof ApiError && error.status === 401) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
}

/** Сообщение для пользователя по ошибке API; `byStatus` переопределяет тексты по коду. */
export function apiErrorMessage(
  error: unknown,
  byStatus: Partial<Record<number, string>> = {},
): string {
  if (error instanceof ApiError && error.status) {
    const override = byStatus[error.status];
    if (override) return override;
    if (error.status < 500 && error.userMessage) return error.userMessage;
  }
  console.error('Action failed', error);
  return 'Сервис временно недоступен. Попробуйте позже.';
}
