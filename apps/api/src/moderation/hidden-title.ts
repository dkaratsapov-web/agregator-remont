/**
 * Название скрытого модератором заказа видит только его владелец (аудит 23.10.2026, F-07):
 * остальным — в уведомлениях, «Моих откликах», «Моих жалобах», отзывах на карточке мастера —
 * эта строка.
 */
export const HIDDEN_JOB_TITLE = 'Заказ скрыт модератором';

/** viewerId не задан — смотрит посторонний (публичная карточка мастера). */
export function visibleJobTitle(
  job: { title: string; hiddenAt: Date | null; ownerId: string | null },
  viewerId?: string,
): string {
  return job.hiddenAt && job.ownerId !== viewerId ? HIDDEN_JOB_TITLE : job.title;
}
