import {
  JOB_CATEGORY_LABELS,
  normalizeCityName,
  type JobCategory,
  type PriceEstimateDto,
} from '@agregator/shared';
import { formatAmount } from './format';

/**
 * Оценка для формы заказа: по городу формы, если она посчитана по нему, иначе по всем
 * городам. Список — оценки по всем городам (city: null) и по городу заказа вместе.
 */
export function pickEstimate(
  estimates: readonly PriceEstimateDto[],
  category: JobCategory | '',
  city: string,
): PriceEstimateDto | null {
  if (!category) return null;
  const key = normalizeCityName(city);
  const own = estimates.find(
    (e) => e.category === category && e.city !== null && normalizeCityName(e.city) === key,
  );
  return own ?? estimates.find((e) => e.category === category && e.city === null) ?? null;
}

/** «по 21 отклику», «по 12 откликам». */
function byBids(n: number): string {
  return `по ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'отклику' : 'откликам'}`;
}

/** Сумма с неразрывным пробелом перед ₽: знак не уходит на новую строку. */
const rub = (value: number) => `${formatAmount(value)}\u00a0₽`;

/** Текст подсказки под бюджетом. */
export function estimateText(estimate: PriceEstimateDto): string {
  const where = estimate.city ? `в городе ${estimate.city}` : 'по всем городам';
  return (
    `Мастера на сервисе обычно просят за такие работы от ${formatAmount(estimate.low)} до ` +
    `${rub(estimate.high)}, половина откликов — дешевле ${rub(estimate.median)}. Посчитано ${byBids(estimate.bids)} в категории ` +
    `«${JOB_CATEGORY_LABELS[estimate.category]}» ${where} за последний год.`
  );
}
