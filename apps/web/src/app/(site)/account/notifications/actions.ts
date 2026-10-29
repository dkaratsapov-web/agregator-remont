'use server';

import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  isUnauthorized,
  redirectIfUnauthorized,
  requireSessionToken,
} from '@/lib/action-helpers';
import { markFeedbackSeen, markNotificationsRead, markReportsSeen } from '@/lib/api';
import { getClientIp } from '@/lib/session';

const PAGE = '/account/notifications';

export interface MarkAllState {
  error?: string;
}

/** «Отметить все прочитанными» на странице уведомлений. */
export async function markAllReadAction(
  _prev: MarkAllState,
  _form: FormData,
): Promise<MarkAllState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  const token = await requireSessionToken(PAGE);
  try {
    // «Все» — и уведомления, и решения по своим жалобам, и ответы поддержки (они тоже в значке).
    await Promise.all([
      markNotificationsRead(token, { all: true }, await getClientIp()),
      markReportsSeen(token),
      markFeedbackSeen(token),
    ]);
  } catch (error) {
    redirectIfUnauthorized(error, PAGE);
    return { error: apiErrorMessage(error) };
  }
  redirect(`${PAGE}?read=1`);
}

/**
 * Человек открыл заказ: его уведомления прочитаны. Вызывается со страницы заказа (MarkSeen),
 * без перехода; сбой не мешает странице — уведомления останутся непрочитанными.
 */
export async function markJobSeenAction(jobId: string): Promise<{ ok: boolean }> {
  if (!(await isTrustedOrigin()) || !isEntityId(jobId)) return { ok: false };
  const token = await requireSessionToken(PAGE);
  try {
    await markNotificationsRead(token, { jobId }, await getClientIp());
    return { ok: true };
  } catch (error) {
    if (!isUnauthorized(error)) console.error('Notifications: failed to mark job as seen', error);
    return { ok: false };
  }
}
