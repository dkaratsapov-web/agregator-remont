'use server';

import { MODERATION_LIMITS, REPORT_LIMITS } from '@agregator/shared';
import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  redirectIfUnauthorized,
  requireSessionToken,
} from '@/lib/action-helpers';
import { resolveFlag, resolveReport, setContentHidden, setUserBlocked } from '@/lib/api';
import { safeRedirectPath } from '@/lib/redirect';
import { getClientIp } from '@/lib/session';
import { argBool, argString, readFormArgs } from '@/lib/form-args';

export interface ModerationFormState {
  error?: string;
}

const ERRORS = {
  403: 'Действие доступно только администратору.',
  404: 'Уже не найдено: обновите страницу.',
};

/** Текст причины или решения из формы; null — не подходит по длине. */
function text(form: FormData, field: string, max: number): string | null {
  const value = String(form.get(field) ?? '').trim();
  return value.length >= MODERATION_LIMITS.REASON_MIN && value.length <= max ? value : null;
}

/** Закрыть жалобу: «Меры приняты» или «Нарушения нет» (кнопка формы) с пояснением. */
export async function resolveReportAction(
  id: string,
  returnTo: string,
  _prev: ModerationFormState,
  form: FormData,
): Promise<ModerationFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!isEntityId(id)) return { error: ERRORS[404] };
  const status = form.get('decision');
  if (status !== 'RESOLVED' && status !== 'DISMISSED') return { error: 'Выберите решение.' };
  const note = text(form, 'text', REPORT_LIMITS.NOTE_MAX);
  if (!note) {
    return {
      error: `Пояснение: от ${MODERATION_LIMITS.REASON_MIN} до ${REPORT_LIMITS.NOTE_MAX} символов.`,
    };
  }
  const back = safeRedirectPath(returnTo);
  const token = await requireSessionToken(back);
  try {
    await resolveReport(token, id, { status, note }, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, back);
    return { error: apiErrorMessage(error, { ...ERRORS, 409: 'Жалобу уже разобрали.' }) };
  }
  redirect(back);
}

/** Скрыть или вернуть заказ, сообщение или отклик с причиной для журнала. */
export async function setHiddenAction(
  kind: 'jobs' | 'messages' | 'bids' | 'reviews',
  id: string,
  hidden: boolean,
  returnTo: string,
  _prev: ModerationFormState,
  form: FormData,
): Promise<ModerationFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!['jobs', 'messages', 'bids', 'reviews'].includes(kind) || !isEntityId(id)) {
    return { error: ERRORS[404] };
  }
  const reason = text(form, 'text', MODERATION_LIMITS.REASON_MAX);
  if (!reason) {
    return {
      error: `Причина: от ${MODERATION_LIMITS.REASON_MIN} до ${MODERATION_LIMITS.REASON_MAX} символов.`,
    };
  }
  const back = safeRedirectPath(returnTo);
  const token = await requireSessionToken(back);
  try {
    await setContentHidden(token, kind, id, { hidden, reason }, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, back);
    return { error: apiErrorMessage(error, ERRORS) };
  }
  redirect(back);
}

/** Заблокировать или разблокировать аккаунт с причиной для журнала. */
export async function setBlockedAction(
  userId: string,
  blocked: boolean,
  returnTo: string,
  _prev: ModerationFormState,
  form: FormData,
): Promise<ModerationFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!isEntityId(userId)) return { error: ERRORS[404] };
  const reason = text(form, 'text', MODERATION_LIMITS.REASON_MAX);
  if (!reason) {
    return {
      error: `Причина: от ${MODERATION_LIMITS.REASON_MIN} до ${MODERATION_LIMITS.REASON_MAX} символов.`,
    };
  }
  const back = safeRedirectPath(returnTo);
  const token = await requireSessionToken(back);
  try {
    await setUserBlocked(token, userId, { blocked, reason }, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, back);
    return { error: apiErrorMessage(error, ERRORS) };
  }
  redirect(back);
}

/** Пометка автопроверки разобрана: меры приняты или нарушения нет (кнопка формы). */
export async function resolveFlagAction(
  id: string,
  returnTo: string,
  _prev: ModerationFormState,
  form: FormData,
): Promise<ModerationFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!isEntityId(id)) return { error: ERRORS[404] };
  const status = form.get('decision');
  if (status !== 'RESOLVED' && status !== 'DISMISSED') return { error: 'Выберите решение.' };
  const back = safeRedirectPath(returnTo);
  const token = await requireSessionToken(back);
  try {
    await resolveFlag(token, id, status, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, back);
    return { error: apiErrorMessage(error, { ...ERRORS, 409: 'Пометку уже разобрали.' }) };
  }
  redirect(back);
}

// --- Формы: параметры скрытым полем args вместо bind (lib/form-args.ts, docs/NO_JS_FORMS.md).

/** args: [reportId, returnTo] */
export async function resolveReportFormAction(prev: ModerationFormState, form: FormData) {
  const [id, returnTo] = readFormArgs(form);
  return resolveReportAction(argString(id), argString(returnTo), prev, form);
}

/** args: [kind, id, hidden, returnTo]; kind — jobs, messages, bids или reviews. */
export async function setHiddenFormAction(prev: ModerationFormState, form: FormData) {
  const [kind, id, hidden, returnTo] = readFormArgs(form);
  const target = argString(kind);
  if (!['jobs', 'messages', 'bids', 'reviews'].includes(target)) return { error: ERRORS[404] };
  return setHiddenAction(
    target as 'jobs' | 'messages' | 'bids' | 'reviews',
    argString(id),
    argBool(hidden),
    argString(returnTo),
    prev,
    form,
  );
}

/** args: [userId, blocked, returnTo] */
export async function setBlockedFormAction(prev: ModerationFormState, form: FormData) {
  const [userId, blocked, returnTo] = readFormArgs(form);
  return setBlockedAction(argString(userId), argBool(blocked), argString(returnTo), prev, form);
}

/** args: [flagId, returnTo] */
export async function resolveFlagFormAction(prev: ModerationFormState, form: FormData) {
  const [id, returnTo] = readFormArgs(form);
  return resolveFlagAction(argString(id), argString(returnTo), prev, form);
}
