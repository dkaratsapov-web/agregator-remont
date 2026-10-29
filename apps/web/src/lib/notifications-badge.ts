import type { NotificationsSummaryDto } from '@agregator/shared';

/**
 * Число в значке: уведомления по заказам, решения по своим жалобам и ответы поддержки, которые
 * человек ещё не открыл.
 */
export function badgeCount(summary: NotificationsSummaryDto): number {
  return summary.unread + summary.reportDecisions + summary.feedbackReplies;
}
