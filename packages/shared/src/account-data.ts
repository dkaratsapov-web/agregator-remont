import type { UserRole } from './auth';
import type { BidStatus } from './bids';
import type { JobCategory, JobCloseOutcome, JobStatus } from './jobs';

/**
 * Свои данные и удаление аккаунта (152-ФЗ, docs/ACCOUNTS.md). Выгрузка — всё, что сервис
 * хранит о человеке и что он сам написал. Чужие личные данные в неё не попадают: у отклика на
 * свой заказ — только число откликов, у отзыва о себе — оценка и текст без имени автора.
 */

/** Имя удалённого аккаунта: так он виден другой стороне в заказах и переписке. */
export const DELETED_USER_NAME = 'Удалённый пользователь';

export interface AccountExportDto {
  /** ISO 8601 */
  exportedAt: string;
  account: {
    id: string;
    publicId: number;
    email: string;
    name: string;
    role: UserRole;
    phone: string | null;
    city: string | null;
    hasAvatar: boolean;
    preferences: { theme: string; scale: string; motion: string };
    createdAt: string;
  };
  contractorProfile: {
    about: string;
    categories: JobCategory[];
    cities: string[];
    experienceYears: number | null;
  } | null;
  jobs: {
    id: string;
    title: string;
    description: string;
    category: JobCategory;
    city: string;
    budgetMin: number | null;
    budgetMax: number | null;
    status: JobStatus;
    closeOutcome: JobCloseOutcome | null;
    details: unknown;
    extraItems: unknown;
    bidsReceived: number;
    createdAt: string;
  }[];
  drafts: {
    id: string;
    title: string | null;
    description: string | null;
    category: JobCategory | null;
    city: string | null;
    details: unknown;
    updatedAt: string;
  }[];
  bids: {
    id: string;
    jobId: string;
    price: number;
    durationDays: number | null;
    comment: string;
    status: BidStatus;
    createdAt: string;
  }[];
  /** Свои сообщения в переписке по заказам (фото — только число). */
  messages: { id: string; jobId: string; body: string; photos: number; createdAt: string }[];
  reviewsWritten: { jobId: string; rating: number; text: string; createdAt: string }[];
  reviewsReceived: { jobId: string; rating: number; text: string; createdAt: string }[];
  favorites: { jobId: string; createdAt: string }[];
  reports: {
    targetType: string;
    reason: string;
    comment: string;
    status: string;
    createdAt: string;
  }[];
  sessions: { device: string | null; createdAt: string; lastSeenAt: string | null }[];
  bankLogins: { provider: string; createdAt: string }[];
}

export interface DeleteAccountInput {
  /** Текущий пароль: удалить аккаунт по одной украденной сессии нельзя. */
  password: string;
}
