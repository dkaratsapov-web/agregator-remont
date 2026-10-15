export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 12,
  MAX_LIMIT: 50,
  /** Защита от запросов с огромным OFFSET. */
  MAX_PAGE: 10_000,
} as const;

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}
