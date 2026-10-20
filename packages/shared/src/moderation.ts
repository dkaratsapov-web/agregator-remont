/**
 * Модерация (фаза 2): жалобы пользователей и действия администратора. Пожаловаться можно на
 * заказ в каталоге, на сообщение в переписке и на отклик к своему заказу. Администратор
 * разбирает очередь жалоб: скрывает заказ, сообщение или отклик и блокирует аккаунт.
 * Каждое действие пишется в журнал.
 */
import type { Paginated } from './pagination';

/** На что жалуются. */
export const REPORT_TARGETS = ['JOB', 'MESSAGE', 'BID'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_TARGET_LABELS: Record<ReportTarget, string> = {
  JOB: 'Заказ',
  MESSAGE: 'Сообщение',
  BID: 'Отклик',
};

export const REPORT_REASONS = ['SPAM', 'FRAUD', 'ABUSE', 'FAKE', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: 'Спам или реклама',
  FRAUD: 'Мошенничество, просят предоплату',
  ABUSE: 'Оскорбления или угрозы',
  FAKE: 'Ненастоящий заказ или отклик',
  OTHER: 'Другое',
};

/** OPEN — ждёт разбора; RESOLVED — меры приняты; DISMISSED — нарушения нет. */
export const REPORT_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: 'Ждёт разбора',
  RESOLVED: 'Меры приняты',
  DISMISSED: 'Нарушения нет',
};

export const REPORT_LIMITS = {
  /** Пояснение к жалобе (для «Другое» — обязательно). */
  COMMENT_MIN: 5,
  COMMENT_MAX: 1000,
  /** Решение администратора. */
  NOTE_MAX: 500,
  /** Жалоб от одного человека за сутки. */
  PER_DAY: 20,
  /** Жалоб на странице очереди. */
  PAGE: 20,
} as const;

export interface ReportInput {
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  /** Пояснение; для OTHER обязательно. */
  comment: string;
}

/** Ответ на жалобу: повторная жалоба на то же самое, пока первая не разобрана, — та же. */
export interface ReportReceivedDto {
  id: string;
  /** true — такая жалоба от вас уже ждёт разбора. */
  duplicate: boolean;
}

/** Что скрыто или заблокировано (для администратора). */
export interface ReportSubjectDto {
  /** Заказ, к которому относится жалоба. */
  jobId: string;
  jobTitle: string;
  /** Что показать администратору: название заказа, текст сообщения или комментарий отклика. */
  excerpt: string;
  /** Скрыт ли предмет жалобы (заказ, сообщение или отклик). */
  hidden: boolean;
  /** Автор предмета жалобы: владелец заказа, автор сообщения или подрядчик отклика. */
  author: { id: string; publicId: number; name: string; blocked: boolean } | null;
}

export interface ReportDto {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  comment: string;
  status: ReportStatus;
  reporter: { id: string; publicId: number; name: string };
  subject: ReportSubjectDto;
  /** Решение администратора; null — жалоба ещё не разобрана. */
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type PaginatedReports = Paginated<ReportDto>;

/** Закрыть жалобу: меры приняты или нарушения нет, с пояснением. */
export interface ResolveReportInput {
  status: Exclude<ReportStatus, 'OPEN'>;
  note: string;
}

/** Скрыть (true) или вернуть (false) заказ, сообщение или отклик. */
export interface HideInput {
  hidden: boolean;
  /** За что: попадает в журнал. */
  reason: string;
}

/** Заблокировать (true) или разблокировать (false) аккаунт. */
export interface BlockInput {
  blocked: boolean;
  reason: string;
}

export const MODERATION_LIMITS = {
  REASON_MIN: 5,
  REASON_MAX: 500,
} as const;

/** Состояние после «скрыть / вернуть». */
export interface HiddenStateDto {
  id: string;
  hidden: boolean;
}

/** Состояние после «заблокировать / разблокировать». */
export interface BlockedStateDto {
  id: string;
  blocked: boolean;
}

/** Фильтр очереди жалоб; ALL — все. */
export const REPORT_FILTERS = ['OPEN', 'RESOLVED', 'DISMISSED', 'ALL'] as const;
export type ReportFilter = (typeof REPORT_FILTERS)[number];
