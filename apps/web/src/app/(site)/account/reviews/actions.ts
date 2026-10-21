'use server';

import { REVIEW_LIMITS } from '@agregator/shared';
import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  isUnauthorized,
  requireSessionToken,
  sessionExpired,
} from '@/lib/action-helpers';
import { createReview } from '@/lib/api';
import { getClientIp } from '@/lib/session';

export interface ReviewFormState {
  error?: string;
  /** Сессия закончилась: ссылка на вход, введённое остаётся в форме. */
  login?: string;
  values?: { rating?: string; text?: string };
}

/**
 * Отзыв заказчика об исполнителе. Номер заказа приходит полем формы, а не через bind: форма
 * со связанными аргументами без JS подвешивает ответ Next.js (docs/NO_JS_FORMS.md).
 */
export async function createReviewAction(
  _prev: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const jobId = String(form.get('jobId') ?? '');
  const rating = String(form.get('rating') ?? '');
  const text = String(form.get('text') ?? '').slice(0, REVIEW_LIMITS.TEXT_MAX + 1);
  const values = { rating, text };
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN, values };
  if (!isEntityId(jobId)) return { error: 'Заказ не найден: обновите страницу.', values };
  const score = Number(rating);
  if (
    !Number.isInteger(score) ||
    score < REVIEW_LIMITS.RATING_MIN ||
    score > REVIEW_LIMITS.RATING_MAX
  ) {
    return { error: 'Поставьте оценку от 1 до 5.', values };
  }
  if (text.trim().length > REVIEW_LIMITS.TEXT_MAX) {
    return { error: `Отзыв: не больше ${REVIEW_LIMITS.TEXT_MAX} символов.`, values };
  }
  const back = `/account/jobs/${jobId}`;
  const token = await requireSessionToken(back);
  try {
    await createReview(token, jobId, { rating: score, text: text.trim() }, await getClientIp());
  } catch (error) {
    if (isUnauthorized(error)) return { ...sessionExpired(back), values };
    return {
      error: apiErrorMessage(error, {
        403: 'Отзыв оставляет заказчик.',
        404: 'Заказ не найден или принадлежит другому пользователю.',
      }),
      values,
    };
  }
  redirect(`${back}?reviewed=1#review`);
}
