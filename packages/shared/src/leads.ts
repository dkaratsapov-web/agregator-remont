/**
 * Заявки на участие в закрытом тестировании (форма на главной).
 * Имя и телефон — персональные данные: собираются только с согласием и только когда
 * заполнены реквизиты оператора для политики конфиденциальности (PRIVACY_OPERATOR).
 */

export const LEAD_LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 80,
  /** Длина сырого ввода телефона (цифры, пробелы, скобки, +, -). */
  PHONE_RAW_MAX: 25,
  /** Защита базы от заливки: не больше стольких новых заявок за сутки на весь сайт. */
  PER_DAY_MAX: 300,
} as const;

/** Версия текста политики: сохраняется вместе с согласием. */
export const PRIVACY_POLICY_VERSION = '2026-10-18';

export interface PrivacyOperator {
  /** ИП или организация, как в ЕГРИП/ЕГРЮЛ. */
  name: string;
  inn: string;
  ogrn: string;
  /** Адрес для обращений субъектов персональных данных. */
  email: string;
}

/**
 * Реквизиты оператора персональных данных. null — реквизиты ещё не получены от владельца:
 * политика показывается как черновик, приём заявок выключен (API отвечает 503).
 */
export const PRIVACY_OPERATOR: PrivacyOperator | null = null;

export interface LeadInput {
  name: string;
  phone: string;
  consent: boolean;
  /** Ловушка для ботов: поле скрыто от людей и должно остаться пустым. */
  website?: string;
}

export interface LeadDto {
  id: string;
  name: string;
  /** +7XXXXXXXXXX */
  phone: string;
  createdAt: string;
  /** Когда администратор отметил заявку обработанной; null — новая. */
  processedAt: string | null;
}

/**
 * Российский номер в формате +7XXXXXXXXXX или null. Принимает 8/7/+7 и 10 цифр без кода,
 * пробелы, скобки и дефисы; первая цифра номера — 3, 4, 8 или 9 (коды городов и мобильные).
 */
export function normalizeRuPhone(raw: string): string | null {
  if (raw.length > LEAD_LIMITS.PHONE_RAW_MAX || !/^[\d\s()+-]+$/.test(raw)) return null;
  if (raw.includes('+') && !/^\s*\+7/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  let national: string;
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    national = digits.slice(1);
  } else if (digits.length === 10 && !raw.includes('+')) {
    national = digits;
  } else {
    return null;
  }
  return /^[3489]\d{9}$/.test(national) ? `+7${national}` : null;
}
