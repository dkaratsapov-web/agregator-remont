'use server';

import { AUTH_LIMITS, SELF_SERVICE_ROLES } from '@agregator/shared';
import { redirect } from 'next/navigation';
import {
  ApiError,
  bankComplete,
  BankLoginError,
  loginUser,
  logoutSession,
  registerUser,
  resetPassword,
} from '@/lib/api';
import { clearResetToken, readResetToken } from '@/lib/password-reset';
import {
  bankErrorCode,
  bankErrorMessage,
  clearBankPending,
  describePending,
  isSelfServiceRole,
  readBankPending,
} from '@/lib/bank-login';
import { safeRedirectPath } from '@/lib/redirect';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  clearSessionCookie,
  getClientIp,
  getSessionToken,
  getUserAgent,
  setSessionCookie,
} from '@/lib/session';

export interface AuthFormState {
  error?: string;
  /** Ошибки у полей формы (подсвечиваются, первое поле получает фокус). */
  fields?: Partial<Record<'name' | 'email' | 'password' | 'repeat', string>>;
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function registerFieldErrors(
  name: string,
  email: string,
  password: string,
): NonNullable<AuthFormState['fields']> {
  const fields: NonNullable<AuthFormState['fields']> = {};
  const nameLength = name.trim().length;
  if (nameLength < AUTH_LIMITS.NAME_MIN || nameLength > AUTH_LIMITS.NAME_MAX) {
    fields.name = `Имя: от ${AUTH_LIMITS.NAME_MIN} до ${AUTH_LIMITS.NAME_MAX} символов.`;
  }
  if (!EMAIL.test(email.trim()) || email.length > AUTH_LIMITS.EMAIL_MAX) {
    fields.email = 'Укажите email в формате name@example.ru.';
  }
  if (password.length < AUTH_LIMITS.PASSWORD_MIN || password.length > AUTH_LIMITS.PASSWORD_MAX) {
    fields.password = `Пароль: от ${AUTH_LIMITS.PASSWORD_MIN} до ${AUTH_LIMITS.PASSWORD_MAX} символов.`;
  }
  return fields;
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
  // Все ошибки сразу и у своих полей (AUDIT_FINDINGS UX-5); те же правила проверяет API.
  const fields = registerFieldErrors(values.name, values.email, password);
  if (Object.keys(fields).length > 0) {
    return { error: 'Проверьте поля, отмеченные ниже.', fields, values };
  }

  try {
    const session = await registerUser(
      { ...values, password },
      await getClientIp(),
      await getUserAgent(),
    );
    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    const message = messageFor(error);
    const taken = error instanceof ApiError && error.status === 409;
    return { error: message, values, ...(taken ? { fields: { email: message } } : {}) };
  }
  redirect('/account');
}

export async function loginAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const values = { email: field(form, 'email', AUTH_LIMITS.EMAIL_MAX + 1) };
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN, values };

  const password = field(form, 'password', AUTH_LIMITS.PASSWORD_MAX + 1);
  const next = safeRedirectPath(form.get('next'));

  try {
    const session = await loginUser(
      { email: values.email, password },
      await getClientIp(),
      await getUserAgent(),
    );
    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    const wrong = error instanceof ApiError && error.status === 401;
    return {
      error: messageFor(error),
      values,
      ...(wrong ? { fields: { password: 'Введите пароль ещё раз.' } } : {}),
    };
  }
  redirect(next);
}

/** Новый пароль по ссылке администратора (lib/password-reset.ts): затем сразу вход. */
export async function resetPasswordAction(
  _prev: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  const password = field(form, 'password', AUTH_LIMITS.PASSWORD_MAX + 1);
  const repeat = field(form, 'repeat', AUTH_LIMITS.PASSWORD_MAX + 1);
  if (password.length < AUTH_LIMITS.PASSWORD_MIN || password.length > AUTH_LIMITS.PASSWORD_MAX) {
    const message = `Пароль: от ${AUTH_LIMITS.PASSWORD_MIN} до ${AUTH_LIMITS.PASSWORD_MAX} символов.`;
    return { error: 'Проверьте поля, отмеченные ниже.', fields: { password: message } };
  }
  if (repeat !== password) {
    return {
      error: 'Проверьте поля, отмеченные ниже.',
      fields: { repeat: 'Пароли не совпадают. Введите тот же пароль ещё раз.' },
    };
  }
  const token = await readResetToken();
  if (!token) {
    return {
      error: 'Ссылка не найдена или устарела. Откройте ссылку из сообщения администратора ещё раз.',
    };
  }
  try {
    const session = await resetPassword(
      { token, password },
      await getClientIp(),
      await getUserAgent(),
    );
    await setSessionCookie(session.token, session.expiresAt);
    await clearResetToken();
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 400 &&
      /ссылк/i.test(error.userMessage ?? '')
    ) {
      await clearResetToken();
    }
    if (
      error instanceof ApiError &&
      error.status === 400 &&
      /email/.test(error.userMessage ?? '')
    ) {
      return { error: 'Проверьте поля, отмеченные ниже.', fields: { password: error.userMessage } };
    }
    return { error: messageFor(error) };
  }
  redirect('/account?password=reset');
}

/** Завершение входа через банк: аккаунта не было, человек выбрал роль (lib/bank-login.ts). */
export async function completeBankAction(
  _prev: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const values = { role: field(form, 'role', 20) };
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN, values };
  if (!isSelfServiceRole(values.role)) {
    return { error: 'Выберите, кто вы: заказчик или подрядчик.', values };
  }
  const pending = await readBankPending();
  if (!pending) return { error: bankErrorMessage('expired'), values };

  try {
    const session = await bankComplete(
      { pending, role: values.role },
      await getClientIp(),
      await getUserAgent(),
    );
    await setSessionCookie(session.token, session.expiresAt);
    await clearBankPending();
  } catch (error) {
    if (error instanceof BankLoginError) {
      if (error.code === 'OAUTH_PENDING_EXPIRED') await clearBankPending();
      const bank = describePending(pending)?.bank;
      return { error: bankErrorMessage(bankErrorCode(error.code, error.status), bank), values };
    }
    return { error: messageFor(error), values };
  }
  redirect('/account');
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
