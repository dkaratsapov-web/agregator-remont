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
  rough: false,
  perSqm: null,
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

  it('adds the price per m² and, with an area, the sum for it', () => {
    const tiling = {
      ...moscow,
      perSqm: { low: 1_200, median: 1_500, high: 1_800, bids: 9, rough: true, city: 'Москва' },
    };
    const plain = (text: string) => text.replace(/\u00a0|\u202f/g, ' ');
    expect(plain(estimateText(tiling))).toContain(
      'За м² (грубо, мало данных) — обычно от 1 200 до 1 800 ₽.',
    );
    expect(plain(estimateText(tiling, 12.5))).toContain(
      'для ваших 12,5 м² это около 15 000–22 500 ₽.',
    );
    expect(estimateText(moscow, 12.5)).not.toContain('За м²');
    // Оценка по Москве, цена за м² — по всем городам: так и сказано.
    const fallback = { ...tiling, perSqm: { ...tiling.perSqm, city: null } };
    expect(plain(estimateText(fallback))).toContain('За м² по всем городам (грубо, мало данных)');
  });

  it('a small sample is named a rough guide first', () => {
    expect(estimateText({ ...all, rough: true })).toMatch(
      /^Откликов пока мало — это грубый ориентир\./,
    );
    expect(estimateText(all)).not.toContain('грубый');
  });

  it('says it is statistics of bids, not a quote', () => {
    expect(estimateText(all)).toMatch(/статистика откликов на сервисе, а не смета/);
  });
});
