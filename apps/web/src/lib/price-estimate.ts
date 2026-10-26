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
  // Мало данных — так и говорим, и не делаем вид, что цифры точные (аудит F-04).
  let text = estimate.rough ? 'Откликов пока мало — это грубый ориентир. ' : '';
  text +=
    `Мастера на сервисе обычно просят за такие работы от ${formatAmount(estimate.low)} до ` +
    `${rub(estimate.high)}, половина откликов — дешевле ${rub(estimate.median)}. Посчитано ` +
    `${byBids(estimate.bids)} в категории «${JOB_CATEGORY_LABELS[estimate.category]}» ${where} ` +
    'за последний год.';
  const sqm = estimate.perSqm;
  if (sqm) {
    // Цена за м² может быть посчитана по всем городам, когда оценка заказа — по городу.
    const sqmWhere =
      sqm.city === estimate.city ? '' : sqm.city ? ` в городе ${sqm.city}` : ' по всем городам';
    text += ` За м²${sqmWhere}${sqm.rough ? ' (грубо, мало данных)' : ''} — обычно от ${formatAmount(sqm.low)} до ${rub(sqm.high)}`;
    text += area
      ? `: для ваших ${areaFormat.format(area)}\u00a0м² это около ` +
        `${formatAmount(roundEstimate(sqm.low * area))}–${rub(roundEstimate(sqm.high * area))}.`
      : '.';
  }
  return `${text} Это статистика откликов на сервисе, а не смета: точную цену назовут мастера.`;
}
