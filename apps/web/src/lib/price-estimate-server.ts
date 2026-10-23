import 'server-only';
import type { PriceEstimateDto } from '@agregator/shared';
import { getPriceEstimates } from './api';

/**
 * Оценки для формы заказа: по всем городам и, если город известен, по нему. Подсказка не
 * главное на странице: при сбое API форма открывается без неё.
 */
export async function loadPriceEstimates(
  token: string,
  city?: string | null,
): Promise<PriceEstimateDto[]> {
  try {
    const [all, local] = await Promise.all([
      getPriceEstimates(token),
      city ? getPriceEstimates(token, city) : Promise.resolve({ items: [] }),
    ]);
    return [...local.items.filter((e) => e.city !== null), ...all.items];
  } catch (error) {
    console.error('Price estimates: failed to load', error);
    return [];
  }
}
