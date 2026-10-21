'use server';

import { headers } from 'next/headers';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  redirectIfUnauthorized,
  requireSessionToken,
} from '@/lib/action-helpers';
import { issuePasswordReset } from '@/lib/api';
import { safeRedirectPath } from '@/lib/redirect';
import { getClientIp } from '@/lib/session';
import { argString, readFormArgs } from '@/lib/form-args';

export interface ResetLinkState {
  error?: string;
  /** Полная ссылка для нового пароля: показывается один раз. */
  link?: string;
  expiresAt?: string;
}

/** Адрес сайта для ссылки: как его видит браузер администратора (Caddy передаёт Host). */
async function siteOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000';
  const proto =
    list.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  return `${proto}://${host}`;
}

/** Ссылка для нового пароля: прежние неиспользованные ссылки человека гаснут. */
export async function issueResetLinkAction(
  userId: string,
  returnTo: string,
  _prev: ResetLinkState,
  _form: FormData,
): Promise<ResetLinkState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!isEntityId(userId)) return { error: 'Пользователь не найден: обновите страницу.' };
  const back = safeRedirectPath(returnTo);
  const token = await requireSessionToken(back);
  try {
    const issued = await issuePasswordReset(token, userId, await getClientIp());
    return { link: `${await siteOrigin()}/reset/${issued.token}`, expiresAt: issued.expiresAt };
  } catch (error) {
    redirectIfUnauthorized(error, back);
    return {
      error: apiErrorMessage(error, {
        403: 'Действие доступно только администратору.',
        404: 'Пользователь не найден: обновите страницу.',
      }),
    };
  }
}

// --- Формы: параметры скрытым полем args вместо bind (lib/form-args.ts, docs/NO_JS_FORMS.md).

/** args: [userId, returnTo] */
export async function issueResetLinkFormAction(prev: ResetLinkState, form: FormData) {
  const [userId, returnTo] = readFormArgs(form);
  return issueResetLinkAction(argString(userId), argString(returnTo), prev, form);
}
