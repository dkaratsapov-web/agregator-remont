import type { Currency } from '@agregator/shared';

const CURRENCY_SIGN: Record<Currency, string> = { RUB: '₽' };
const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Moscow',
});

export function formatBudget(min: number | null, max: number | null, currency: Currency): string {
  const sign = CURRENCY_SIGN[currency];
  const fmt = (value: number) => `${numberFormat.format(value)}\u00a0${sign}`;

  if (min !== null && max !== null) {
    return min === max ? fmt(min) : `от ${numberFormat.format(min)} до ${fmt(max)}`;
  }
  if (min !== null) return `от ${fmt(min)}`;
  if (max !== null) return `до ${fmt(max)}`;
  return 'По договорённости';
}

/** «300 000» для полей ввода; разбор обратно — parseBudget (пробелы допускаются). */
export function formatAmount(value: number): string {
  return numberFormat.format(value);
}

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}
