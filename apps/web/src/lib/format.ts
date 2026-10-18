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

/** «1 год», «3 года», «12 лет». */
export function formatYears(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'год'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'года'
        : 'лет';
  return `${n} ${word}`;
}
