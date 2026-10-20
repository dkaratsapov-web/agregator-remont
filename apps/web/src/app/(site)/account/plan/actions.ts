'use server';

import { PLAN_LIMITS, QUIT_REASON_LIMITS, type PlanParty } from '@agregator/shared';
import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  isUnauthorized,
  redirectIfUnauthorized,
  requireSessionToken,
  sessionExpired,
} from '@/lib/action-helpers';
import {
  acceptStage,
  approvePlan,
  proposePlan,
  quitJob,
  returnPlan,
  reworkStage,
  savePlan,
  setPlanAuthor,
  submitStage,
} from '@/lib/api';
import { parsePlanForm, type PlanFieldErrors, type PlanFormValues } from '@/lib/plan-form';
import { safeRedirectPath } from '@/lib/redirect';
import { getClientIp } from '@/lib/session';

export interface PlanActionState {
  error?: string;
  /** Ссылка на вход в новой вкладке, если сессия закончилась посреди ввода. */
  login?: string;
  fields?: PlanFieldErrors;
  values?: PlanFormValues;
  /** Введённый комментарий: остаётся в поле после ошибки. */
  comment?: string;
}

const NOT_FOUND = 'Заказ не найден или вы больше не участник сделки.';
const ERRORS = { 404: NOT_FOUND };

const withNotice = (path: string, notice: string) =>
  `${path}${path.includes('?') ? '&' : '?'}plan=${notice}`;

/** Общая часть: источник, идентификаторы, сессия. */
async function prepare(jobId: string, returnTo: string, stageId?: string) {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN } as const;
  if (!isEntityId(jobId) || (stageId !== undefined && !isEntityId(stageId))) {
    return { error: NOT_FOUND } as const;
  }
  const back = safeRedirectPath(returnTo);
  const token = await requireSessionToken(back);
  return { back, token, clientIp: await getClientIp() } as const;
}

const commentOf = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value.slice(0, PLAN_LIMITS.COMMENT_MAX + 1) : '';
};

function checkComment(comment: string, label: string, min: number, max: number) {
  const length = comment.trim().length;
  return length < min || length > max ? `${label}: от ${min} до ${max} символов.` : null;
}

/** Черновик плана: «Сохранить» или «Отправить на согласование» (кнопка intent=propose). */
export async function savePlanAction(
  jobId: string,
  version: number,
  returnTo: string,
  _prev: PlanActionState,
  form: FormData,
): Promise<PlanActionState> {
  const propose = form.get('intent') === 'propose';
  const parsed = parsePlanForm(form, version, propose);
  const ready = await prepare(jobId, returnTo);
  if ('error' in ready) return { error: ready.error, values: parsed.values };
  if (!parsed.ok) return { error: parsed.error, fields: parsed.fields, values: parsed.values };
  try {
    const saved = await savePlan(ready.token, jobId, parsed.input, ready.clientIp);
    if (propose) await proposePlan(ready.token, jobId, saved.version, ready.clientIp);
  } catch (error) {
    if (isUnauthorized(error)) return { ...sessionExpired(ready.back), values: parsed.values };
    return { error: apiErrorMessage(error, ERRORS), values: parsed.values };
  }
  redirect(withNotice(ready.back, propose ? 'proposed' : 'saved'));
}

/** Кто составляет план (заказчик, пока план не отправлен). */
export async function setPlanAuthorAction(
  jobId: string,
  version: number,
  author: PlanParty,
  returnTo: string,
): Promise<PlanActionState> {
  const ready = await prepare(jobId, returnTo);
  if ('error' in ready) return { error: ready.error };
  try {
    await setPlanAuthor(ready.token, jobId, version, author, ready.clientIp);
  } catch (error) {
    redirectIfUnauthorized(error, ready.back);
    return { error: apiErrorMessage(error, ERRORS) };
  }
  redirect(withNotice(ready.back, 'author'));
}

export async function approvePlanAction(
  jobId: string,
  version: number,
  returnTo: string,
): Promise<PlanActionState> {
  const ready = await prepare(jobId, returnTo);
  if ('error' in ready) return { error: ready.error };
  try {
    await approvePlan(ready.token, jobId, version, ready.clientIp);
  } catch (error) {
    redirectIfUnauthorized(error, ready.back);
    return { error: apiErrorMessage(error, ERRORS) };
  }
  redirect(withNotice(ready.back, 'approved'));
}

export async function returnPlanAction(
  jobId: string,
  version: number,
  returnTo: string,
  _prev: PlanActionState,
  form: FormData,
): Promise<PlanActionState> {
  const reason = commentOf(form, 'reason');
  const ready = await prepare(jobId, returnTo);
  if ('error' in ready) return { error: ready.error, comment: reason };
  const invalid = checkComment(
    reason,
    'Что изменить',
    PLAN_LIMITS.COMMENT_MIN,
    PLAN_LIMITS.COMMENT_MAX,
  );
  if (invalid) return { error: invalid, comment: reason };
  try {
    await returnPlan(ready.token, jobId, version, reason.trim(), ready.clientIp);
  } catch (error) {
    if (isUnauthorized(error)) return { ...sessionExpired(ready.back), comment: reason };
    return { error: apiErrorMessage(error, ERRORS), comment: reason };
  }
  redirect(withNotice(ready.back, 'returned'));
}

export async function submitStageAction(
  jobId: string,
  stageId: string,
  returnTo: string,
  _prev: PlanActionState,
  form: FormData,
): Promise<PlanActionState> {
  const comment = commentOf(form, 'comment');
  const ready = await prepare(jobId, returnTo, stageId);
  if ('error' in ready) return { error: ready.error, comment };
  const invalid = checkComment(
    comment,
    'Комментарий',
    PLAN_LIMITS.COMMENT_MIN,
    PLAN_LIMITS.COMMENT_MAX,
  );
  if (invalid) return { error: invalid, comment };
  try {
    await submitStage(ready.token, jobId, stageId, comment.trim(), ready.clientIp);
  } catch (error) {
    if (isUnauthorized(error)) return { ...sessionExpired(ready.back), comment };
    return { error: apiErrorMessage(error, ERRORS), comment };
  }
  redirect(withNotice(ready.back, 'submitted'));
}

export async function acceptStageAction(
  jobId: string,
  stageId: string,
  returnTo: string,
): Promise<PlanActionState> {
  const ready = await prepare(jobId, returnTo, stageId);
  if ('error' in ready) return { error: ready.error };
  try {
    await acceptStage(ready.token, jobId, stageId, ready.clientIp);
  } catch (error) {
    redirectIfUnauthorized(error, ready.back);
    return { error: apiErrorMessage(error, ERRORS) };
  }
  redirect(withNotice(ready.back, 'accepted'));
}

export async function reworkStageAction(
  jobId: string,
  stageId: string,
  returnTo: string,
  _prev: PlanActionState,
  form: FormData,
): Promise<PlanActionState> {
  const comment = commentOf(form, 'comment');
  const ready = await prepare(jobId, returnTo, stageId);
  if ('error' in ready) return { error: ready.error, comment };
  const invalid = checkComment(
    comment,
    'Что доработать',
    PLAN_LIMITS.COMMENT_MIN,
    PLAN_LIMITS.COMMENT_MAX,
  );
  if (invalid) return { error: invalid, comment };
  try {
    await reworkStage(ready.token, jobId, stageId, comment.trim(), ready.clientIp);
  } catch (error) {
    if (isUnauthorized(error)) return { ...sessionExpired(ready.back), comment };
    return { error: apiErrorMessage(error, ERRORS), comment };
  }
  redirect(withNotice(ready.back, 'rework'));
}

/** Исполнитель отказывается от заказа: заказ снова открыт, отклик отозван. */
export async function quitJobAction(
  jobId: string,
  returnTo: string,
  _prev: PlanActionState,
  form: FormData,
): Promise<PlanActionState> {
  const reason = commentOf(form, 'reason');
  const ready = await prepare(jobId, returnTo);
  if ('error' in ready) return { error: ready.error, comment: reason };
  const invalid = checkComment(reason, 'Причина', QUIT_REASON_LIMITS.MIN, QUIT_REASON_LIMITS.MAX);
  if (invalid) return { error: invalid, comment: reason };
  try {
    await quitJob(ready.token, jobId, reason.trim(), ready.clientIp);
  } catch (error) {
    if (isUnauthorized(error)) return { ...sessionExpired(ready.back), comment: reason };
    return { error: apiErrorMessage(error, ERRORS), comment: reason };
  }
  redirect('/account/bids?quit=1');
}
