'use server';

import { AUTH_LIMITS, SELF_SERVICE_ROLES } from '@agregator/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, loginUser, logoutSession, registerUser } from '@/lib/api';
import { safeRedirectPath } from '@/lib/redirect';
import { isSameOriginRequest } from '@/lib/same-origin';
import { clearSessionCookie, getClientIp, getSessionToken, setSessionCookie } from '@/lib/session';

export interface AuthFormState {
  error?: string;
  /** Введённые значения (кроме пароля), чтобы не очищать форму при ошибке. */
  values?: Record<string, string>;
}

const FOREIGN_ORIGIN = 'Запрос отклонён. Обновите страницу и попробуйте снова.';

/** Server Actions — публичные эндпоинты: источник проверяется в каждом из них. */
async function isTrustedOrigin(): Promise<boolean> {
  const h = await headers();
  return isSameOriginRequest((name) => h.get(name));
}

const field = (form: FormData, key: string, max: number): string => {
  const value = form.get(key);
  return typeof value === 'string' ? value.slice(0, max) : '';
};

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Слишком много попыток. Подождите минуту и попробуйте снова.';
    // Сообщения с подсказкой, что делать дальше.
    if (error.status === 401) return 'Неверный email или пароль. Проверьте раскладку и Caps Lock.';
    if (error.status === 409 && error.userMessage?.includes('уже зарегистрирован')) {
      return 'Этот email уже зарегистрирован. Войдите в аккаунт или укажите другой email.';
    }
    if (error.status && error.status < 500 && error.userMessage) return error.userMessage;
  }
  console.error('Auth action failed', error);
  return 'Сервис временно недоступен. Попробуйте позже.';
}

export async function registerAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  // Пароль обрезается чуть длиннее лимита, чтобы API вернул понятную ошибку валидации.
  const values = {
    name: field(form, 'name', AUTH_LIMITS.NAME_MAX + 1),
    email: field(form, 'email', AUTH_LIMITS.EMAIL_MAX + 1),
    role: field(form, 'role', 20),
  };
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN, values };

  const password = field(form, 'password', AUTH_LIMITS.PASSWORD_MAX + 1);
  if (!(SELF_SERVICE_ROLES as readonly string[]).includes(values.role)) {
    return { error: 'Выберите, кто вы: заказчик или подрядчик.', values };
  }

  try {
    const session = await registerUser({ ...values, password }, await getClientIp());
    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    return { error: messageFor(error), values };
  }
  redirect('/account');
}

export async function loginAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const values = { email: field(form, 'email', AUTH_LIMITS.EMAIL_MAX + 1) };
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN, values };

  const password = field(form, 'password', AUTH_LIMITS.PASSWORD_MAX + 1);
  const next = safeRedirectPath(form.get('next'));

  try {
    const session = await loginUser({ email: values.email, password }, await getClientIp());
    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    return { error: messageFor(error), values };
  }
  redirect(next);
}

/**
 * Cookie удаляется только если API подтвердил отзыв сессии (или она уже недействительна).
 * При сбое API пользователь остаётся в аккаунте и видит ошибку: иначе он считал бы, что вышел,
 * а токен продолжал бы действовать до истечения срока.
 */
export async function logoutAction(_prev: AuthFormState, _form: FormData): Promise<AuthFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };

  const token = await getSessionToken();
  if (token) {
    const result = await logoutSession(token);
    if (result === 'failed') {
      return { error: 'Не удалось выйти: сервис временно недоступен. Попробуйте ещё раз.' };
    }
  }
  await clearSessionCookie();
  redirect('/');
}
