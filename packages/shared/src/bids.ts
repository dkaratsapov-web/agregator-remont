import type { JobCategory, JobStatus } from './jobs';

export const BID_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const;
export type BidStatus = (typeof BID_STATUSES)[number];

export const BID_STATUS_LABELS: Record<BidStatus, string> = {
  PENDING: 'На рассмотрении',
  ACCEPTED: 'Выбран исполнителем',
  REJECTED: 'Не выбран',
  WITHDRAWN: 'Отозван',
};

export const BID_LIMITS = {
  COMMENT_MIN: 10,
  COMMENT_MAX: 2000,
  DURATION_MAX_DAYS: 365,
  /** Сколько откликов один подрядчик может оставить за 24 часа. */
  CREATED_PER_DAY: 30,
} as const;

export const PROFILE_LIMITS = {
  ABOUT_MAX: 2000,
  CATEGORIES_MAX: 10,
  CITIES_MAX: 10,
  CITY_MIN: 2,
  CITY_MAX: 100,
  EXPERIENCE_MAX_YEARS: 70,
} as const;

/** Профиль подрядчика. Контакты (email) сюда не входят и заказчику не показываются. */
export interface ContractorProfileDto {
  about: string;
  categories: JobCategory[];
  cities: string[];
  experienceYears: number | null;
  /** ISO 8601; null, если профиль ещё не заполнялся. */
  updatedAt: string | null;
}

export interface ContractorProfileInput {
  about: string;
  categories: JobCategory[];
  cities: string[];
  experienceYears: number | null;
}

export interface BidInput {
  /** Цена в целых рублях. */
  price: number;
  durationDays: number | null;
  comment: string;
}

export interface BidDto {
  id: string;
  jobId: string;
  status: BidStatus;
  price: number;
  durationDays: number | null;
  comment: string;
  /** ISO 8601 */
  createdAt: string;
}

/** Отклик в кабинете подрядчика: с краткой информацией о заказе. */
export interface MyBidDto extends BidDto {
  job: { id: string; title: string; city: string; status: JobStatus };
}

/** Отклик, который видит владелец заказа: подрядчик без email и других контактов. */
export interface JobBidDto extends BidDto {
  contractor: { name: string; profile: ContractorProfileDto | null };
}
