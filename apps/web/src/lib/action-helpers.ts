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

export const loginHref = (next: string) => `/login?next=${encodeURIComponent(next)}`;

export const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401;

/** Истёкшая сессия → на вход с возвратом. Для действий без ввода (кнопки). */
export function redirectIfUnauthorized(error: unknown, next: string): void {
  if (isUnauthorized(error)) redirect(loginHref(next));
}

/**
 * Сессия закончилась посреди заполнения формы (AUDIT_FINDINGS MVP-4). Переход на вход потерял
 * бы введённое, поэтому форма остаётся на месте со значениями и ссылкой на вход в новой вкладке.
 */
export const SESSION_EXPIRED =
  'Сессия закончилась. Войдите в новой вкладке, вернитесь сюда и отправьте форму ещё раз: всё введённое на месте.';

export interface SessionExpiredState {
  error: string;
  /** Ссылка на вход с возвратом на эту страницу. */
  login: string;
}

export const sessionExpired = (next: string): SessionExpiredState => ({
  error: SESSION_EXPIRED,
  login: loginHref(next),
});

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
