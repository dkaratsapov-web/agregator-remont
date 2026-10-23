import type { JobCategory } from './jobs';

/**
 * Оценка цены для формы заказа: сколько обычно просят мастера в этой категории. Только по
 * откликам сервиса, без ИИ и внешних данных (docs/PRICE_ESTIMATES.md).
 *
 * Чтобы по оценке нельзя было узнать цену конкретного мастера, она показывается только при
 * достаточном числе откликов, заказов и разных мастеров, а суммы округляются.
 */
export const PRICE_ESTIMATE = {
  /** Откликов в категории не меньше. */
  MIN_BIDS: 5,
  /** Разных заказов не меньше. */
  MIN_JOBS: 3,
  /** Разных мастеров не меньше. */
  MIN_CONTRACTORS: 3,
  /** Окно: отклики не старше стольких дней. */
  WINDOW_DAYS: 365,
  /** Суммы округляются до стольких рублей. */
  ROUND_TO: 500,
} as const;

export interface PriceEstimateDto {
  category: JobCategory;
  /** Город, по которому посчитано; null — по всем городам (в городе мало данных). */
  city: string | null;
  /** Нижняя четверть цен откликов, ₽. */
  low: number;
  /** Медиана, ₽. */
  median: number;
  /** Верхняя четверть, ₽. */
  high: number;
  /** Сколько откликов учтено. */
  bids: number;
}

export interface PriceEstimatesDto {
  /** Только категории, по которым данных достаточно. */
  items: PriceEstimateDto[];
}

/** Округление суммы оценки до PRICE_ESTIMATE.ROUND_TO (не меньше одного шага). */
export function roundEstimate(value: number): number {
  const step = PRICE_ESTIMATE.ROUND_TO;
  return Math.max(step, Math.round(value / step) * step);
}
