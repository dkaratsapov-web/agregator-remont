import { isJobCategory, type JobCategory, PAGINATION } from '@agregator/shared';

type RawParam = string | string[] | undefined;

/** Нормализует ?page: всё, что не положительное целое в допустимых пределах, даёт 1. */
export function parsePage(raw: RawParam): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 && page <= PAGINATION.MAX_PAGE ? page : 1;
}

/** Неизвестная категория игнорируется, чтобы ссылка с опечаткой не ломала каталог. */
export function parseCategory(raw: RawParam): JobCategory | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isJobCategory(value) ? value : undefined;
}

export function jobsHref(params: { page?: number; category?: JobCategory }): string {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.page && params.page > 1) query.set('page', String(params.page));
  const qs = query.toString();
  return qs ? `/jobs?${qs}` : '/jobs';
}
