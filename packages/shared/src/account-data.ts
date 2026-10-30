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
  /** Свои обращения в поддержку с ответами. */
  feedback: {
    kind: string;
    body: string;
    page: string | null;
    createdAt: string;
    reply: string | null;
    repliedAt: string | null;
  }[];
  /**
   * Планы работ по своим сделкам — как заказчика и как исполнителя (план общий для обеих
   * сторон). У этапа — число фото-отчётов.
   */
  plans: {
    jobId: string;
    author: string;
    sequential: boolean;
    status: string;
    returnReason: string | null;
    proposedAt: string | null;
    approvedAt: string | null;
    stages: {
      position: number;
      title: string;
      description: string;
      durationDays: number | null;
      status: string;
      submitComment: string | null;
      reworkComment: string | null;
      submittedAt: string | null;
      acceptedAt: string | null;
      photos: number;
    }[];
  }[];
  /** Свои загруженные фото (в переписке и к этапам): без самих файлов. */
  photos: {
    id: string;
    jobId: string;
    stageId: string | null;
    messageId: string | null;
    width: number;
    height: number;
    bytes: number;
    createdAt: string;
  }[];
  /** Сделки, в которых свои контакты открыты другой стороне. */
  contactShares: { jobId: string; createdAt: string }[];
  sessions: { device: string | null; createdAt: string; lastSeenAt: string | null }[];
  bankLogins: { provider: string; createdAt: string }[];
}

export interface DeleteAccountInput {
  /** Текущий пароль: удалить аккаунт по одной украденной сессии нельзя. */
  password: string;
}
