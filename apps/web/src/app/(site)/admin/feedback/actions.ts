'use server';

import { FEEDBACK_LIMITS } from '@agregator/shared';
import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  redirectIfUnauthorized,
  requireSessionToken,
} from '@/lib/action-helpers';
import { replyFeedback } from '@/lib/api';
import { argString, readFormArgs } from '@/lib/form-args';
import { safeRedirectPath } from '@/lib/redirect';
import { getClientIp } from '@/lib/session';

export interface FeedbackReplyState {
  error?: string;
  reply?: string;
}

/** Ответ администратора на обращение. Роль ADMIN проверяет API. */
export async function replyFeedbackAction(
  id: string,
  returnTo: string,
  _prev: FeedbackReplyState,
  form: FormData,
): Promise<FeedbackReplyState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!isEntityId(id)) return { error: 'Обращение не найдено.' };
  const raw = form.get('reply');
  const reply = typeof raw === 'string' ? raw.slice(0, FEEDBACK_LIMITS.REPLY_MAX + 1) : '';
  if (reply.trim().length < FEEDBACK_LIMITS.REPLY_MIN) {
    return { error: 'Напишите ответ.', reply };
  }
  const back = safeRedirectPath(returnTo);
  const token = await requireSessionToken(back);
  try {
    await replyFeedback(token, id, reply, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, back);
    return {
      error: apiErrorMessage(error, {
        403: 'Обращения доступны только администратору.',
        404: 'Обращение не найдено.',
        409: 'На это обращение уже ответили: обновите страницу.',
      }),
      reply,
    };
  }
  redirect(back);
}

// --- Формы: параметры скрытым полем args вместо bind (lib/form-args.ts, docs/NO_JS_FORMS.md).

/** args: [feedbackId, returnTo] */
export async function replyFeedbackFormAction(prev: FeedbackReplyState, form: FormData) {
  const [id, returnTo] = readFormArgs(form);
  return replyFeedbackAction(argString(id), argString(returnTo), prev, form);
}
