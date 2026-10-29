'use server';

import { FEEDBACK_KINDS, FEEDBACK_LIMITS, type FeedbackKind } from '@agregator/shared';
import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isUnauthorized,
  redirectIfUnauthorized,
  requireSessionToken,
} from '@/lib/action-helpers';
import { markFeedbackSeen, sendFeedback } from '@/lib/api';
import { getClientIp } from '@/lib/session';

const FEEDBACK = '/account/feedback';

export interface FeedbackFormState {
  error?: string;
  /** Введённое — чтобы не набирать заново после ошибки. */
  values?: { kind: string; body: string };
}

const isKind = (value: unknown): value is FeedbackKind =>
  typeof value === 'string' && (FEEDBACK_KINDS as readonly string[]).includes(value);

/** Путь страницы сайта, с которой написали: только «/…», без домена и пробелов. */
function pagePath(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const path = value.trim().slice(0, FEEDBACK_LIMITS.PAGE_MAX);
  return /^\/(?!\/)[^\s]*$/.test(path) ? path : undefined;
}

/** Обращение в поддержку. Успех — переход на «Мои обращения» с пометкой «отправлено». */
export async function sendFeedbackAction(
  _prev: FeedbackFormState,
  form: FormData,
): Promise<FeedbackFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  const kind = form.get('kind');
  const raw = form.get('body');
  const body = typeof raw === 'string' ? raw.slice(0, FEEDBACK_LIMITS.BODY_MAX + 1) : '';
  const values = { kind: typeof kind === 'string' ? kind : '', body };
  if (!isKind(kind)) return { error: 'Выберите: ошибка, идея или вопрос', values };
  if (body.trim().length < FEEDBACK_LIMITS.BODY_MIN) {
    return {
      error: `Опишите подробнее: не меньше ${FEEDBACK_LIMITS.BODY_MIN} символов`,
      values,
    };
  }
  const token = await requireSessionToken(FEEDBACK);
  try {
    await sendFeedback(
      token,
      { kind, body, page: pagePath(form.get('page')) },
      await getClientIp(),
    );
  } catch (error) {
    redirectIfUnauthorized(error, FEEDBACK);
    return { error: apiErrorMessage(error), values };
  }
  redirect(`${FEEDBACK}?sent=1`);
}

/**
 * Человек открыл «Мои обращения»: ответы поддержки просмотрены и пропадают из значка.
 * Вызывается со страницы (FeedbackSeen), без перехода; без JS ответы отмечаются кнопкой
 * «Отметить все прочитанными» на странице уведомлений.
 */
export async function markFeedbackSeenAction(): Promise<{ ok: boolean }> {
  if (!(await isTrustedOrigin())) return { ok: false };
  const token = await requireSessionToken(FEEDBACK);
  try {
    await markFeedbackSeen(token);
    return { ok: true };
  } catch (error) {
    if (!isUnauthorized(error)) console.error('Feedback: failed to mark replies seen', error);
    return { ok: false };
  }
}
