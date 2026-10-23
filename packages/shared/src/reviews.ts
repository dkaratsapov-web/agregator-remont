/**
 * Отзывы и рейтинг исполнителя (фаза 2). Отзыв оставляет заказчик после того, как закрыл заказ
 * как выполненный: один отзыв на заказ, изменить нельзя. Рейтинг — среднее по видимым отзывам
 * (скрытые модератором не считаются). Публичный профиль мастера — без контактов.
 */
import type { ContractorProfileDto } from './bids';

export const REVIEW_LIMITS = {
  RATING_MIN: 1,
  RATING_MAX: 5,
  TEXT_MAX: 1000,
  /** Отзывов на странице профиля. */
  PAGE: 10,
} as const;

export interface ReviewInput {
  rating: number;
  text: string;
}

export interface ReviewDto {
  id: string;
  rating: number;
  text: string;
  /** Имя заказчика (без фамилии и контактов, как он указал в профиле). */
  authorName: string;
  jobTitle: string;
  /** ISO 8601 */
  createdAt: string;
}

/** Рейтинг: среднее с одним знаком после запятой; null — отзывов нет. */
export interface ContractorRatingDto {
  average: number | null;
  count: number;
}

/** Публичная карточка мастера: /contractors/<publicId>. */
export interface PublicContractorDto {
  publicId: number;
  name: string;
  profile: ContractorProfileDto | null;
  rating: ContractorRatingDto;
  /** Заказов, закрытых заказчиком как выполненные с этим исполнителем. */
  completedJobs: number;
  /** ISO 8601: на сервисе с. */
  memberSince: string;
  reviews: ReviewDto[];
  /** Есть ещё отзывы (страница `?page=`). */
  hasMoreReviews: boolean;
}

/** Отзыв по заказу для заказчика: можно ли оставить и что уже оставлено. */
export interface JobReviewStateDto {
  /** Заказ закрыт как выполненный с исполнителем, отзыва ещё нет. */
  canReview: boolean;
  review: ReviewDto | null;
  contractor: { publicId: number; name: string } | null;
}

/** Склонение «отзыв» для числа. */
export function reviewsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'отзыв';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'отзыва';
  return 'отзывов';
}
