import type { PriceEstimateDto } from '@agregator/shared';
import { describe, expect, it } from 'vitest';
import { estimateText, pickEstimate } from './price-estimate';

const all: PriceEstimateDto = {
  category: 'TILING',
  city: null,
  low: 15_000,
  median: 20_000,
  high: 30_000,
  bids: 40,
};
const moscow: PriceEstimateDto = { ...all, city: 'Москва', low: 20_000, high: 35_000, bids: 12 };

describe('price estimate in the job form', () => {
  it('prefers the form city, then all cities; nothing without a category', () => {
    expect(pickEstimate([moscow, all], 'TILING', 'москва ')).toBe(moscow);
    expect(pickEstimate([moscow, all], 'TILING', 'Королёв')).toBe(all);
    expect(pickEstimate([moscow, all], 'TILING', '')).toBe(all);
    expect(pickEstimate([moscow, all], 'PLUMBING', 'Москва')).toBeNull();
    expect(pickEstimate([moscow, all], '', 'Москва')).toBeNull();
  });

  it('says the range, the median, how many bids and where', () => {
    const text = estimateText(moscow).replace(/\u00a0|\u202f/g, ' ');
    expect(text).toContain('от 20 000 до 35 000 ₽');
    expect(text).toContain('дешевле 20 000 ₽');
    expect(text).toContain('по 12 откликам');
    expect(estimateText({ ...all, bids: 21 })).toContain('по 21 отклику');
    expect(text).toContain('«Плиточные работы»');
    expect(text).toContain('в городе Москва');
    expect(estimateText(all)).toContain('по всем городам');
  });
});
