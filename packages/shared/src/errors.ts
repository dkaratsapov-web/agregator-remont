/**
 * Единый формат ошибок API (ADR 0002): у каждой ошибки есть машинный `code`, у ошибок проверки
 * ввода — ещё и `fieldErrors`. Поля прежнего формата NestJS (`statusCode`, `message`, `error`)
 * сохранены, поэтому формат совместим с прежними клиентами. Клиент, получивший неизвестный
 * код, действует по статусу: 4xx — показать `message`, 401 — экран входа, 429 — подождать
 * `Retry-After`, 5xx — общий текст.
 */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'BAD_REQUEST',
  'NO_FIELDS_TO_UPDATE',
  'BUDGET_RANGE_INVALID',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'FORBIDDEN_ROLE',
  'NOT_FOUND',
  'CONFLICT',
  'EMAIL_TAKEN',
  'JOB_NOT_OPEN',
  'JOB_ALREADY_CLOSED',
  'BID_ALREADY_EXISTS',
  'BID_NOT_PENDING',
  'PASSWORD_INVALID',
  'ACCOUNT_HAS_ACTIVE_DEALS',
  'ACCOUNT_DELETED',
  'ACCOUNT_IS_ADMIN',
  'GONE',
  'PAYLOAD_TOO_LARGE',
  'UNPROCESSABLE',
  'RATE_LIMITED',
  'LOGIN_THROTTLED',
  'DAILY_QUOTA_EXCEEDED',
  'INTERNAL',
  'BAD_GATEWAY',
  'UNAVAILABLE',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const FIELD_ERROR_CODES = [
  'INVALID',
  'REQUIRED',
  'TOO_SHORT',
  'TOO_LONG',
  'OUT_OF_RANGE',
  'UNKNOWN_FIELD',
] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];

export interface FieldError {
  /** Путь к полю через точку, индекс массива — числом: `title`, `items.2.category`. */
  path: string;
  code: FieldErrorCode;
  /** Текст для показа рядом с полем. */
  message: string;
}

export interface ApiErrorBody {
  statusCode: number;
  /** Машинный код: из API_ERROR_CODES или доменный (вход через банк — OAUTH_*). */
  code: string;
  /** Строка; массив — только у VALIDATION_FAILED (те же тексты, что в fieldErrors). */
  message: string | string[];
  /** Текстовое имя статуса («Conflict»). */
  error: string;
  fieldErrors?: FieldError[];
}
