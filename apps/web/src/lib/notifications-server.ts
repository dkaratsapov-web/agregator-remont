import 'server-only';
import type { NotificationsSummaryDto } from '@agregator/shared';
import { cache } from 'react';
import { getNotificationsSummary } from './api';
import { getSessionState } from './session';

/**
 * Непрочитанное текущего пользователя (один запрос к API на рендер: шапка, списки заказов и
 * страница заказа берут одну и ту же сводку). null — не вошёл или API не ответил: тогда значок
 * без числа, страница работает как обычно.
 */
export const getUnreadSummary = cache(async (): Promise<NotificationsSummaryDto | null> => {
  const session = await getSessionState();
  if (session.kind !== 'user') return null;
  try {
    return await getNotificationsSummary(session.token);
  } catch (error) {
    console.error('Notifications: failed to load summary', error);
    return null;
  }
});

/** Непрочитанных по заказу (0 — нет или сводка недоступна). */
export function unreadForJob(summary: NotificationsSummaryDto | null, jobId: string): number {
  return summary?.jobs.find((job) => job.jobId === jobId)?.unread ?? 0;
}
