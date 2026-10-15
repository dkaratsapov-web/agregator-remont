'use server';

import { AUTH_LIMITS, SELF_SERVICE_ROLES } from '@agregator/shared';
import { redirect } from 'next/navigation';
import { ApiError, loginUser, logoutSession, registerUser } from '@/lib/api';
import { safeRedirectPath } from '@/lib/redirect';
import { clearSessionCookie, getClientIp, getSessionToken, setSessionCookie } from '@/lib/session';

export interface AuthFormState {
  error?: string;
  /** Введённые значения (кроме пароля), чтобы не очищать форму при ошибке. */
  values?: Record<string, string>;
}

const field = (form: FormData, key: string, max: number): string => {
  const value = form.get(key);
  return typeof value === 'string' ? value.slice(0, max) : '';
};

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Слишком много попыток. Подождите минуту и попробуйте снова.';
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

export async function logoutAction(): Promise<void> {
  const token = await getSessionToken();
  if (token) await logoutSession(token);
  await clearSessionCookie();
  redirect('/');
}
