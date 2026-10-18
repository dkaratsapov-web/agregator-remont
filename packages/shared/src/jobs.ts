import type { JobDetails } from './job-questions';

/**
 * Контракт публичного API заказов. Значения enum'ов должны совпадать
 * с enum'ами в apps/api/prisma/schema.prisma (проверяется тестом в API).
 */
export const JOB_CATEGORIES = [
  'REPAIR_TURNKEY',
  'PLUMBING',
  'ELECTRICAL',
  'TILING',
  'FINISHING',
  'FLOORING',
  'ROOFING',
  'WINDOWS_DOORS',
  'DESIGN',
  'OTHER',
] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];

export const JOB_CATEGORY_LABELS: Record<JobCategory, string> = {
  REPAIR_TURNKEY: 'Ремонт под ключ',
  PLUMBING: 'Сантехника',
  ELECTRICAL: 'Электрика',
  TILING: 'Плиточные работы',
  FINISHING: 'Отделочные работы',
  FLOORING: 'Полы',
  ROOFING: 'Кровля',
  WINDOWS_DOORS: 'Окна и двери',
  DESIGN: 'Дизайн интерьера',
  OTHER: 'Другое',
};

export const JOB_STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  OPEN: 'Открыт',
  IN_PROGRESS: 'В работе',
  CLOSED: 'Закрыт',
};

export const CURRENCIES = ['RUB'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Заказ в ответах API. Суммы — целые рубли; null означает «по договорённости». */
export interface JobDto {
  id: string;
  title: string;
  description: string;
  category: JobCategory;
  city: string;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: Currency;
  status: JobStatus;
  /** Ответы на вопросы анкеты категории (см. job-questions.ts); {} если анкета не заполнена. */
  details: JobDetails;
  /** ISO 8601 */
  createdAt: string;
}

export function isJobCategory(value: unknown): value is JobCategory {
  return typeof value === 'string' && (JOB_CATEGORIES as readonly string[]).includes(value);
}

export const JOB_LIMITS = {
  TITLE_MIN: 5,
  TITLE_MAX: 160,
  DESCRIPTION_MIN: 20,
  DESCRIPTION_MAX: 5000,
  CITY_MIN: 2,
  CITY_MAX: 100,
  /** Верхняя граница бюджета в рублях (защита от переполнения и опечаток). */
  BUDGET_MAX: 1_000_000_000,
  /** Сколько заказов один пользователь может создать за 24 часа. */
  CREATED_PER_DAY: 20,
} as const;

/** Поиск в каталоге: длина строки запроса после обрезки пробелов. */
export const JOB_SEARCH = {
  QUERY_MIN: 2,
  QUERY_MAX: 100,
} as const;

/** Поля, которые заказчик задаёт сам. Владелец, статус и даты задаёт только сервер. */
export interface JobInput {
  title: string;
  description: string;
  category: JobCategory;
  city: string;
  budgetMin: number | null;
  budgetMax: number | null;
  /** Ответы анкеты. При создании без поля сохраняется {}; при правке отсутствие = не менять. */
  details?: JobDetails;
}

/** Заказ в кабинете владельца. */
export interface OwnJobDto extends JobDto {
  /** ISO 8601 */
  updatedAt: string;
  /** Редактировать можно только открытый заказ. */
  editable: boolean;
}
