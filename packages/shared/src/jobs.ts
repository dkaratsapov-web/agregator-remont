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
  /** ISO 8601 */
  createdAt: string;
}

export function isJobCategory(value: unknown): value is JobCategory {
  return typeof value === 'string' && (JOB_CATEGORIES as readonly string[]).includes(value);
}
