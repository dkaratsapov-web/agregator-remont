'use server';

import {
  ACCOUNT_LIMITS,
  AUTH_LIMITS,
  LEAD_LIMITS,
  UI_MOTIONS,
  UI_SCALES,
  UI_THEMES,
  type UiPreferences,
} from '@agregator/shared';
import { revalidatePath } from 'next/cache';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  redirectIfUnauthorized,
  requireSessionToken,
} from '@/lib/action-helpers';
import {
  changePassword,
  revokeOtherSessions,
  revokeSession,
  updatePreferences,
  updateProfile,
} from '@/lib/api';
import { getClientIp } from '@/lib/session';
import { argString, readFormArgs } from '@/lib/form-args';

const SETTINGS = '/account/settings';

export interface SettingsState {
  error?: string;
  /** Сообщение об успехе (показывается рядом с формой). */
  done?: string;
  values?: Record<string, string>;
}

const field = (form: FormData, key: string, max: number): string => {
  const value = form.get(key);
  return typeof value === 'string' ? value.slice(0, max) : '';
};

/** Имя, телефон, город. Пустой телефон или город удаляют значение. */
export async function profileAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const values = {
    name: field(form, 'name', AUTH_LIMITS.NAME_MAX + 1),
    phone: field(form, 'phone', LEAD_LIMITS.PHONE_RAW_MAX + 1),
    city: field(form, 'city', ACCOUNT_LIMITS.CITY_MAX + 1),
  };
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN, values };
  const token = await requireSessionToken(SETTINGS);
  try {
    await updateProfile(
      token,
      { name: values.name, phone: values.phone || null, city: values.city || null },
      await getClientIp(),
    );
  } catch (error) {
    redirectIfUnauthorized(error, SETTINGS);
    return { error: apiErrorMessage(error), values };
  }
  revalidatePath('/', 'layout');
  return { done: 'Профиль сохранён' };
}

const pick = <T extends string>(value: FormDataEntryValue | null, allowed: readonly T[]) =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

/** Тема, масштаб, анимации: применяются сразу на всех устройствах пользователя. */
export async function preferencesAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  const token = await requireSessionToken(SETTINGS);
  const input: Partial<UiPreferences> = {
    theme: pick(form.get('theme'), UI_THEMES),
    scale: pick(form.get('scale'), UI_SCALES),
    motion: pick(form.get('motion'), UI_MOTIONS),
  };
  try {
    await updatePreferences(token, input, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, SETTINGS);
    return { error: apiErrorMessage(error) };
  }
  revalidatePath('/', 'layout');
  return { done: 'Сохранено' };
}

export async function passwordAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  const token = await requireSessionToken(SETTINGS);
  const currentPassword = field(form, 'currentPassword', AUTH_LIMITS.PASSWORD_MAX + 1);
  const newPassword = field(form, 'newPassword', AUTH_LIMITS.PASSWORD_MAX + 1);
  if (newPassword !== field(form, 'confirmPassword', AUTH_LIMITS.PASSWORD_MAX + 1)) {
    return { error: 'Новый пароль и повтор не совпадают' };
  }
  try {
    await changePassword(token, { currentPassword, newPassword }, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, SETTINGS);
    return {
      error: apiErrorMessage(error, {
        429: 'Слишком много попыток. Подождите минуту и попробуйте снова.',
      }),
    };
  }
  revalidatePath(SETTINGS);
  return { done: 'Пароль изменён. На других устройствах нужно войти заново.' };
}

export async function revokeSessionAction(
  id: string,
  _prev: SettingsState,
  _form: FormData,
): Promise<SettingsState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!isEntityId(id)) return { error: 'Сеанс не найден' };
  const token = await requireSessionToken(SETTINGS);
  try {
    await revokeSession(token, id, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, SETTINGS);
    return { error: apiErrorMessage(error) };
  }
  revalidatePath(SETTINGS);
  return { done: 'Сеанс завершён' };
}

export async function revokeOthersAction(
  _prev: SettingsState,
  _form: FormData,
): Promise<SettingsState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  const token = await requireSessionToken(SETTINGS);
  try {
    const count = await revokeOtherSessions(token, await getClientIp());
    revalidatePath(SETTINGS);
    return { done: count > 0 ? `Завершено сеансов: ${count}` : 'Других сеансов нет' };
  } catch (error) {
    redirectIfUnauthorized(error, SETTINGS);
    return { error: apiErrorMessage(error) };
  }
}

// --- Формы: параметры скрытым полем args вместо bind (lib/form-args.ts, docs/NO_JS_FORMS.md).

/** args: [sessionId] */
export async function revokeSessionFormAction(prev: SettingsState, form: FormData) {
  const [id] = readFormArgs(form);
  return revokeSessionAction(argString(id), prev, form);
}
