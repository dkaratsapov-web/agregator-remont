import {
  JOB_CATEGORY_LABELS,
  normalizeCityName,
  roundEstimate,
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

const areaFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/**
 * Текст подсказки под бюджетом. С ценой за м²: её диапазон, а если в анкете указана площадь
 * работ (workArea), — сколько это для этой площади.
 */
export function estimateText(estimate: PriceEstimateDto, area: number | null = null): string {
  const where = estimate.city ? `в городе ${estimate.city}` : 'по всем городам';
  let text =
    `Мастера на сервисе обычно просят за такие работы от ${formatAmount(estimate.low)} до ` +
    `${rub(estimate.high)}, половина откликов — дешевле ${rub(estimate.median)}. Посчитано ` +
    `${byBids(estimate.bids)} в категории «${JOB_CATEGORY_LABELS[estimate.category]}» ${where} ` +
    'за последний год.';
  const sqm = estimate.perSqm;
  if (sqm) {
    text += ` За м² — обычно от ${formatAmount(sqm.low)} до ${rub(sqm.high)}`;
    text += area
      ? `: для ваших ${areaFormat.format(area)}\u00a0м² это около ` +
        `${formatAmount(roundEstimate(sqm.low * area))}–${rub(roundEstimate(sqm.high * area))}.`
      : '.';
  }
  return text;
}
