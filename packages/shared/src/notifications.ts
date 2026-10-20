/**
 * Уведомления в кабинете (фаза 2): что произошло по заказу и требует внимания другой стороны —
 * новый отклик, выбор исполнителя, план на согласовании, сданный этап, новые сообщения и т. п.
 * Пишутся в той же транзакции, что и само событие. Почта и пуш — позже (решение владельца).
 */
import type { BidRejectReason } from './bids';
import type { PlanParty } from './plans';

/** Что случилось; получатель — всегда другая сторона, не тот, кто действовал. */
export const NOTIFICATION_KINDS = [
  /** Заказчику: новый отклик на заказ. */
  'BID_RECEIVED',
  /** Заказчику: исполнитель отозвал отклик. */
  'BID_WITHDRAWN',
  /** Исполнителю: его выбрали. */
  'BID_ACCEPTED',
  /** Исполнителю: выбран другой или заказ закрыт без выбора. */
  'BID_REJECTED',
  /** Стороне, которая согласует: план прислан на согласование. */
  'PLAN_PROPOSED',
  /** Составителю плана: план согласован. */
  'PLAN_APPROVED',
  /** Составителю плана: план возвращён с причиной. */
  'PLAN_RETURNED',
  /** Исполнителю: заказчик поменял, кто составляет план. */
  'PLAN_AUTHOR_CHANGED',
  /** Заказчику: этап сдан, ждёт проверки. */
  'STAGE_SUBMITTED',
  /** Исполнителю: этап принят. */
  'STAGE_ACCEPTED',
  /** Исполнителю: этап возвращён на доработку. */
  'STAGE_REWORK',
  /** Заказчику: исполнитель отказался от заказа. */
  'CONTRACTOR_QUIT',
  /** Исполнителю: заказчик закрыл заказ. */
  'JOB_CLOSED',
  /** Новые сообщения в переписке; непрочитанные по заказу собираются в одно уведомление. */
  'MESSAGE',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_LIMITS = {
  /** Уведомлений на странице списка. */
  PAGE: 30,
  /** Сколько id можно отметить прочитанными за раз. */
  MARK_MAX: 100,
  /** Заказов с непрочитанным в сводке. */
  SUMMARY_JOBS: 100,
} as const;

/** Подробности события (снимок на момент события: этап могут удалить вместе с планом). */
export interface NotificationData {
  /** Название этапа — для событий этапа. */
  stageTitle?: string;
  /** Цена отклика, ₽ — для откликов. */
  price?: number;
  /** Срок из отклика, дней. */
  durationDays?: number;
  /** Почему отклик отклонён — для BID_REJECTED. */
  reason?: BidRejectReason;
  /** Чем закрыт заказ — для JOB_CLOSED. */
  outcome?: 'COMPLETED' | 'CANCELLED';
}

export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  jobId: string;
  /** Текущее название заказа. */
  jobTitle: string;
  /** Кем получатель приходится заказу: от этого зависит, куда ведёт уведомление. */
  party: PlanParty;
  /** Сколько событий собрано (новые сообщения); у остальных — 1. */
  count: number;
  data: NotificationData;
  read: boolean;
  /** Последнее событие, ISO 8601. */
  createdAt: string;
}

export interface NotificationsPageDto {
  items: NotificationDto[];
  /** Непрочитанных всего. */
  unread: number;
  /** Курсор следующей страницы (id последнего уведомления) или null. */
  nextCursor: string | null;
}

export interface NotificationsSummaryDto {
  /** Непрочитанных всего — для значка в шапке кабинета. */
  unread: number;
  /** Заказы с непрочитанным — для пометок в списках заказов. */
  jobs: { jobId: string; unread: number }[];
}

/**
 * Что отметить прочитанным: ровно одно из — всё, уведомления по заказу или перечисленные.
 */
export interface MarkNotificationsReadInput {
  all?: true;
  jobId?: string;
  ids?: string[];
}
