/**
 * Результат заявки, отправленной с главной без JS: /lead отвечает переходом на `/?lead=<код>`.
 * В адрес попадает только код, не имя и не телефон.
 */
export const LEAD_RESULT_ERRORS = {
  consent: 'Отметьте согласие на обработку персональных данных.',
  invalid: 'Проверьте имя и телефон: укажите российский номер.',
  limit: 'Слишком много заявок. Попробуйте позже.',
  closed: 'Приём заявок скоро откроется.',
  failed: 'Не удалось отправить заявку. Попробуйте позже.',
} as const;

export type LeadResult = 'sent' | keyof typeof LEAD_RESULT_ERRORS;

/** Код из адреса; неизвестное значение — null. */
export function parseLeadResult(value: unknown): LeadResult | null {
  if (typeof value !== 'string') return null;
  return value === 'sent' || Object.hasOwn(LEAD_RESULT_ERRORS, value)
    ? (value as LeadResult)
    : null;
}
