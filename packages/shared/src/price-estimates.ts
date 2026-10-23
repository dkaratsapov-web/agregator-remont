import type { JobDetails } from './job-questions';
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
  /** Цена за м² округляется до стольких рублей. */
  SQM_ROUND_TO: 50,
  /**
   * Грубый ориентир (rough): откликов меньше или заказов меньше. Отклики на один заказ похожи
   * друг на друга, а квартили по малой выборке неустойчивы (аудит 23.10.2026, F-04).
   */
  ROUGH_BELOW_BIDS: 20,
  ROUGH_BELOW_JOBS: 8,
  /** Цена за м² — только по заказам не меньше этой площади: на мелких работах цена за метр
   *  не показательна и искажает выборку. */
  SQM_MIN_AREA: 3,
} as const;

/**
 * Площадь работ по анкете для цены за м²: вопросы, сумма ответов на которые — площадь работ.
 * Только там, где площадь и есть объём работ: у электрики площадь спрашивается лишь при полной
 * замене проводки или электрике с нуля. Нет в списке — цены за м² у категории нет.
 */
export const PRICE_AREA_QUESTIONS: Partial<Record<JobCategory, readonly string[]>> = {
  REPAIR_TURNKEY: ['area'],
  ELECTRICAL: ['area'],
  TILING: ['floorArea', 'wallArea'],
  FINISHING: ['wallArea'],
  FLOORING: ['area'],
  ROOFING: ['area'],
  DESIGN: ['area'],
};

/** Площадь работ по ответам анкеты, м²; null — площади нет. */
export function workArea(category: JobCategory, details: JobDetails): number | null {
  const keys = PRICE_AREA_QUESTIONS[category];
  if (!keys) return null;
  const area = keys.reduce((sum, key) => {
    const value = details[key];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);
  return area > 0 ? area : null;
}

/** Нижняя четверть, медиана и верхняя четверть, ₽; bids — сколько откликов учтено. */
export interface PriceRangeDto {
  low: number;
  median: number;
  high: number;
  bids: number;
  /** Мало данных (PRICE_ESTIMATE.ROUGH_BELOW_*): показывать как грубый ориентир. */
  rough: boolean;
}

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
  /** Мало данных (PRICE_ESTIMATE.ROUGH_BELOW_*): показывать как грубый ориентир. */
  rough: boolean;
  /**
   * Цена за м² по заказам, где в анкете указана площадь работ (PRICE_AREA_QUESTIONS). Сначала
   * по городу, при нехватке данных — по всем городам, даже если оценка заказа посчитана по
   * городу: где именно, говорит perSqm.city. null — таких откликов мало и по всем городам.
   */
  perSqm: PriceSqmDto | null;
}

export interface PriceSqmDto extends PriceRangeDto {
  /** Город, по которому посчитана цена за м²; null — по всем городам. */
  city: string | null;
}

export interface PriceEstimatesDto {
  /** Только категории, по которым данных достаточно. */
  items: PriceEstimateDto[];
}

/** Округление суммы оценки до шага (по умолчанию PRICE_ESTIMATE.ROUND_TO), не меньше шага. */
export function roundEstimate(value: number, step: number = PRICE_ESTIMATE.ROUND_TO): number {
  return Math.max(step, Math.round(value / step) * step);
}
