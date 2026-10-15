import { describe, expect, it } from 'vitest';
import { formatBudget, formatDate } from './format';

// Intl для ru-RU разделяет разряды неразрывным пробелом.
const n = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('formatBudget', () => {
  it('formats a range', () => {
    expect(n(formatBudget(2500, 4000, 'RUB'))).toBe('от 2 500 до 4 000 ₽');
  });
  it('formats one-sided and equal bounds', () => {
    expect(n(formatBudget(15000, null, 'RUB'))).toBe('от 15 000 ₽');
    expect(n(formatBudget(null, 110000, 'RUB'))).toBe('до 110 000 ₽');
    expect(n(formatBudget(5000, 5000, 'RUB'))).toBe('5 000 ₽');
  });
  it('handles negotiable budget', () => {
    expect(formatBudget(null, null, 'RUB')).toBe('По договорённости');
  });
});

describe('formatDate', () => {
  it('uses Moscow time', () => {
    expect(formatDate('2026-01-14T22:30:00.000Z')).toBe('15 января 2026 г.');
  });
});
