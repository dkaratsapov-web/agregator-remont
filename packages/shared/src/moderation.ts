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

/** Пожаловавшийся видит свои жалобы и решения по ним («Мои жалобы»). */
export interface MyReportDto {
  id: string;
  targetType: ReportTarget;
  reason: ReportReason;
  status: ReportStatus;
  jobId: string;
  jobTitle: string;
  /** Решение администратора; null — не разобрана. */
  note: string | null;
  /** ISO 8601 */
  createdAt: string;
  resolvedAt: string | null;
  /** Решение есть, но человек его ещё не открывал. */
  unseen: boolean;
}

/**
 * Автопроверка текста: похоже на контакты (телефон, почта, ссылка, мессенджер). Контакты сторон
 * по правилам сервиса не передаются (`docs/JOB_PLAN.md`): текст отправляется, но администратор
 * видит пометку в очереди, а автор — предупреждение.
 */
export const CONTENT_FLAG_KINDS = ['PHONE', 'EMAIL', 'LINK', 'MESSENGER'] as const;
export type ContentFlagKind = (typeof CONTENT_FLAG_KINDS)[number];

export const CONTENT_FLAG_LABELS: Record<ContentFlagKind, string> = {
  PHONE: 'телефон',
  EMAIL: 'почта',
  LINK: 'ссылка',
  MESSENGER: 'мессенджер',
};

const EMAIL_PATTERN = /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.[\p{L}]{2,}/u;
const LINK_PATTERN =
  /(?:https?:\/\/|www\.)\S+|(?:^|[^\p{L}\d@.])[\p{L}\d-]{2,}\.(?:ru|рф|su|com|net|org|me|io|info|pro|online|site)(?![\p{L}\d])/iu;
const MESSENGER_PATTERN =
  /(?:^|[^\p{L}])(?:whats\s?app|ватс?\s?ап|вацап|вотс?ап|telegram|телеграм\p{L}*|телег[аеиу]|viber|вайбер|t\.me|wa\.me)(?![\p{L}])|(?:^|[\s(])@[a-z][a-z\d_]{4,}/iu;
// Номер: 10–11 цифр подряд, через пробелы, дефисы, точки или скобки, с +7, 7 или 8 впереди или
// с кода 3xx–9xx. Цены («18 000», «1 500 000») короче и сюда не попадают.
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{8,18}\d/g;

function looksLikePhone(text: string): boolean {
  for (const match of text.matchAll(PHONE_CANDIDATE)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length === 11 && /^[78][3-9]/.test(digits)) return true;
    if (digits.length === 10 && /^[3-9]/.test(digits) && !/\s\d{3}\s\d{3}$/.test(match[0])) {
      return true;
    }
  }
  return false;
}

/** Что в тексте похоже на контакты; [] — ничего. */
export function detectContacts(text: string): ContentFlagKind[] {
  const found: ContentFlagKind[] = [];
  if (looksLikePhone(text)) found.push('PHONE');
  if (EMAIL_PATTERN.test(text)) found.push('EMAIL');
  const withoutEmails = text.replace(new RegExp(EMAIL_PATTERN.source, 'gu'), ' ');
  if (LINK_PATTERN.test(withoutEmails)) found.push('LINK');
  if (MESSENGER_PATTERN.test(withoutEmails)) found.push('MESSENGER');
  return found;
}

/** Пометка автопроверки в очереди администратора. */
export interface ContentFlagDto {
  id: string;
  targetType: Extract<ReportTarget, 'MESSAGE' | 'BID'>;
  targetId: string;
  kinds: ContentFlagKind[];
  status: ReportStatus;
  jobId: string;
  jobTitle: string;
  /** Текст сообщения или комментарий отклика (обрезан). */
  excerpt: string;
  hidden: boolean;
  author: { id: string; publicId: number; name: string; blocked: boolean };
  /** ISO 8601 */
  createdAt: string;
}

export interface ResolveFlagInput {
  /** RESOLVED — меры приняты, DISMISSED — нарушения нет. */
  status: Exclude<ReportStatus, 'OPEN'>;
}

/** Предупреждение автору: что увидит человек под полем ввода. */
export function contactsWarning(kinds: readonly ContentFlagKind[]): string | null {
  if (kinds.length === 0) return null;
  const what = kinds.map((kind) => CONTENT_FLAG_LABELS[kind]).join(', ');
  return `Похоже, в тексте есть контакты (${what}). Общение и договорённости — через сервис: так сохраняется история на случай спора. Сообщение увидит модератор.`;
}
