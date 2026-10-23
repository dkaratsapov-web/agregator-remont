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

/** Чем закончился закрытый заказ. */
export const JOB_CLOSE_OUTCOMES = ['COMPLETED', 'CANCELLED'] as const;
export type JobCloseOutcome = (typeof JOB_CLOSE_OUTCOMES)[number];

export const JOB_CLOSE_OUTCOME_LABELS: Record<JobCloseOutcome, string> = {
  COMPLETED: 'Выполнен',
  CANCELLED: 'Отменён',
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
  /** Позиции других категорий (job-items.ts); [] если в заказе одна категория. */
  extraItems: JobItemDto[];
  /** ISO 8601 */
  createdAt: string;
}

/** Позиция заказа: категория и ответы её анкеты. */
export interface JobItemDto {
  category: JobCategory;
  details: JobDetails;
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
  /** Позиции других категорий (до 4). При создании без поля — []; при правке — не менять. */
  extraItems?: JobItemDto[];
  /** Только при создании: черновик, из которого опубликован заказ; удаляется вместе с ним. */
  draftId?: string;
  /**
   * Только при создании: ключ формы (UUID). Повтор того же запроса (двойной клик, обрыв связи)
   * вернёт уже созданный заказ, а не создаст второй.
   */
  requestId?: string;
}

/** Правка заказа: изменённые поля и версия, с которой открыта форма. */
export interface JobUpdateInput extends Partial<Omit<JobInput, 'draftId' | 'requestId'>> {
  /** updatedAt заказа на момент открытия формы; заказ изменён с тех пор → 409. */
  expectedUpdatedAt?: string;
}

/** Заказ в кабинете владельца. */
export interface OwnJobDto extends JobDto {
  /** ISO 8601 */
  updatedAt: string;
  /** Редактировать можно только открытый заказ. */
  editable: boolean;
  /** Исход закрытого заказа; null — не закрыт или закрыт до появления поля. */
  closeOutcome: JobCloseOutcome | null;
  /** Скрыт модератором: в каталоге не виден, откликаться нельзя. */
  hidden: boolean;
}

/** Черновики нового заказа: видны только владельцу, в каталог не попадают. */
export const DRAFT_LIMITS = {
  /** Сколько черновиков может хранить один заказчик. */
  MAX_PER_USER: 10,
} as const;

/**
 * Незаконченный заказ. Любое поле может быть пустым; ответы анкеты проверяются мягко
 * (неверные отбрасываются). Полная проверка — при публикации (POST /v1/me/jobs с draftId).
 */
export interface JobDraftInput {
  title?: string | null;
  description?: string | null;
  category?: JobCategory | null;
  city?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  details?: JobDetails;
  extraItems?: JobItemDto[];
  /** Только при замене: updatedAt черновика из последнего сохранения этой формы; иначе 409. */
  expectedUpdatedAt?: string;
}

export interface JobDraftDto {
  id: string;
  title: string | null;
  description: string | null;
  category: JobCategory | null;
  city: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  details: JobDetails;
  extraItems: JobItemDto[];
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** Избранные заказы (закладки). */
export const FAVORITE_LIMITS = {
  /** Сколько заказов можно держать в избранном. */
  MAX: 200,
  PAGE: 20,
} as const;

export interface FavoriteStateDto {
  jobId: string;
  favorite: boolean;
}

/** id заказов в избранном — для пометок в каталоге. */
export interface FavoriteIdsDto {
  jobIds: string[];
}
