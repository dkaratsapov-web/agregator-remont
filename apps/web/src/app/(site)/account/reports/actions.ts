'use server';

import {
  REPORT_LIMITS,
  REPORT_REASONS,
  REPORT_TARGETS,
  type ReportReason,
  type ReportTarget,
} from '@agregator/shared';
import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  isUnauthorized,
  requireSessionToken,
  sessionExpired,
  type SessionExpiredState,
} from '@/lib/action-helpers';
import { ApiError, createReport, markReportsSeen } from '@/lib/api';
import { safeRedirectPath } from '@/lib/redirect';
import { getClientIp } from '@/lib/session';
import { argString, readFormArgs } from '@/lib/form-args';

export interface ReportFormState {
  error?: string;
  /** Ссылка на вход, если сессия закончилась. */
  login?: string;
  /** Жалоба принята (duplicate — такая уже ждёт разбора). */
  sent?: { duplicate: boolean };
}

/** Итог жалобы в адресе страницы (без JS): sent, duplicate или код ошибки. */
export type ReportOutcome = 'sent' | 'duplicate' | 'invalid' | 'gone' | 'limit' | 'failed';

/**
 * Жалоба из формы «Пожаловаться». returnTo — страница, где форма. С JS (поле js=1, его ставит
 * сама форма после загрузки) итог возвращается в форму. Без JS — переход на ту же страницу с
 * ?report=<итог>: страница показывает его сверху (ответ с состоянием формы на страницах с
 * параметром в адресе без JS браузер не дожидается).
 */
export async function reportAction(
  targetType: ReportTarget,
  targetId: string,
  returnTo: string,
  _prev: ReportFormState,
  form: FormData,
): Promise<ReportFormState> {
  const back = safeRedirectPath(returnTo);
  const withJs = form.get('js') === '1';
  const done = (state: ReportFormState, outcome: ReportOutcome): ReportFormState => {
    if (withJs) return state;
    const [path, hash = ''] = back.split('#');
    redirect(`${path}${path.includes('?') ? '&' : '?'}report=${outcome}${hash ? `#${hash}` : ''}`);
  };
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!REPORT_TARGETS.includes(targetType) || !isEntityId(targetId)) {
    return done({ error: 'Не удалось отправить жалобу: обновите страницу.' }, 'failed');
  }
  const reason = String(form.get('reason') ?? '');
  const comment = String(form.get('comment') ?? '').trim();
  if (!REPORT_REASONS.includes(reason as ReportReason)) {
    return done({ error: 'Выберите причину.' }, 'invalid');
  }
  if (reason === 'OTHER' && comment.length < REPORT_LIMITS.COMMENT_MIN) {
    return done(
      { error: `Опишите, что не так: от ${REPORT_LIMITS.COMMENT_MIN} символов.` },
      'invalid',
    );
  }
  if (comment.length > REPORT_LIMITS.COMMENT_MAX) {
    return done(
      { error: `Пояснение: не больше ${REPORT_LIMITS.COMMENT_MAX} символов.` },
      'invalid',
    );
  }
  const token = await requireSessionToken(back);
  let result: ReportFormState;
  let outcome: ReportOutcome;
  try {
    const res = await createReport(
      token,
      { targetType, targetId, reason: reason as ReportReason, comment },
      await getClientIp(),
    );
    result = { sent: { duplicate: res.duplicate } };
    outcome = res.duplicate ? 'duplicate' : 'sent';
  } catch (error) {
    if (isUnauthorized(error)) {
      const expired: SessionExpiredState = sessionExpired(back);
      return { error: expired.error, login: expired.login };
    }
    const status = error instanceof ApiError ? error.status : undefined;
    result = {
      error: apiErrorMessage(error, {
        404: 'Это уже недоступно: возможно, его скрыли или удалили.',
        429: `Можно отправить не больше ${REPORT_LIMITS.PER_DAY} жалоб за сутки.`,
      }),
    };
    outcome = status === 404 ? 'gone' : status === 429 ? 'limit' : 'failed';
  }
  return done(result, outcome);
}

/**
 * Человек открыл «Мои жалобы»: решения просмотрены и пропадают из значка. Вызывается со страницы
 * (ReportsSeen), без перехода; без JS решения отмечаются кнопкой «Отметить все прочитанными».
 */
export async function markReportsSeenAction(): Promise<{ ok: boolean }> {
  if (!(await isTrustedOrigin())) return { ok: false };
  const token = await requireSessionToken('/account/reports');
  try {
    await markReportsSeen(token);
    return { ok: true };
  } catch (error) {
    if (!isUnauthorized(error)) console.error('Reports: failed to mark decisions seen', error);
    return { ok: false };
  }
}

/** Форма «Пожаловаться»; args: [targetType, targetId, returnTo] (lib/form-args.ts). */
export async function reportFormAction(
  prev: ReportFormState,
  form: FormData,
): Promise<ReportFormState> {
  const [targetType, targetId, returnTo] = readFormArgs(form);
  return reportAction(
    argString(targetType) as ReportTarget,
    argString(targetId),
    argString(returnTo),
    prev,
    form,
  );
}
