import {
  isJobCategory,
  JOB_LIMITS,
  JOB_POSTED_DAYS,
  JOB_SEARCH,
  JOB_SORTS,
  JOB_STATUSES,
  type JobCategory,
  type JobPostedDays,
  type JobSort,
  type JobStatus,
  PAGINATION,
} from '@agregator/shared';

type RawParam = string | string[] | undefined;

const first = (raw: RawParam) => (Array.isArray(raw) ? raw[0] : raw);

/** Нормализует ?page: всё, что не положительное целое в допустимых пределах, даёт 1. */
export function parsePage(raw: RawParam): number {
  const value = first(raw);
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 && page <= PAGINATION.MAX_PAGE ? page : 1;
}

/** Неизвестная категория игнорируется, чтобы ссылка с опечаткой не ломала каталог. */
export function parseCategory(raw: RawParam): JobCategory | undefined {
  const value = first(raw);
  return isJobCategory(value) ? value : undefined;
}

/** Текст поиска: обрезка пробелов; слишком короткий или длинный запрос игнорируется (API его отклонит). */
export function parseQuery(raw: RawParam): string | undefined {
  const value = first(raw)?.trim();
  if (!value || value.length < JOB_SEARCH.QUERY_MIN || value.length > JOB_SEARCH.QUERY_MAX) {
    return undefined;
  }
  return value;
}

export function parseCity(raw: RawParam): string | undefined {
  const value = first(raw)?.trim();
  if (!value || value.length < JOB_LIMITS.CITY_MIN || value.length > JOB_LIMITS.CITY_MAX) {
    return undefined;
  }
  return value;
}

/**
 * Статус: ?status=OPEN|IN_PROGRESS|CLOSED. Старые ссылки «Только открытые» (?open=1) значат
 * OPEN.
 */
export function parseStatus(raw: RawParam, legacyOpen?: RawParam): JobStatus | undefined {
  const value = first(raw);
  if ((JOB_STATUSES as readonly string[]).includes(value ?? '')) return value as JobStatus;
  return first(legacyOpen) === '1' ? 'OPEN' : undefined;
}

/** Сумма бюджета: цифры, пробелы между разрядами допустимы («100 000»); иное игнорируется. */
export function parseBudget(raw: RawParam): number | undefined {
  const value = first(raw)?.replace(/[\s\u00a0\u202f]/g, '');
  if (!value || !/^\d{1,10}$/.test(value)) return undefined;
  const amount = Number(value);
  return amount <= JOB_LIMITS.BUDGET_MAX ? amount : undefined;
}

export function parsePostedDays(raw: RawParam): JobPostedDays | undefined {
  const value = Number(first(raw));
  return (JOB_POSTED_DAYS as readonly number[]).includes(value)
    ? (value as JobPostedDays)
    : undefined;
}

/** «Ещё без откликов»: ?noBids=1. */
export function parseNoBids(raw: RawParam): boolean {
  return first(raw) === '1';
}

/** Сортировка; «сначала новые» — по умолчанию, в адресе не пишется. */
export function parseSort(raw: RawParam): JobSort | undefined {
  const value = first(raw);
  return value !== 'new' && (JOB_SORTS as readonly string[]).includes(value ?? '')
    ? (value as JobSort)
    : undefined;
}

export interface JobsFilters {
  category?: JobCategory;
  q?: string;
  city?: string;
  status?: JobStatus;
  budgetFrom?: number;
  budgetTo?: number;
  days?: JobPostedDays;
  noBids?: boolean;
  sort?: JobSort;
}

/** Сколько фильтров задано (кроме категории — у неё свой список). */
export function activeFilterCount(filters: JobsFilters): number {
  return [
    filters.q,
    filters.city,
    filters.status,
    filters.budgetFrom,
    filters.budgetTo,
    filters.days,
    filters.noBids || undefined,
    filters.sort,
  ].filter((value) => value !== undefined && value !== '').length;
}

export function jobsHref(params: JobsFilters & { page?: number }): string {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.city) query.set('city', params.city);
  if (params.category) query.set('category', params.category);
  if (params.status) query.set('status', params.status);
  if (params.budgetFrom !== undefined) query.set('budgetFrom', String(params.budgetFrom));
  if (params.budgetTo !== undefined) query.set('budgetTo', String(params.budgetTo));
  if (params.days) query.set('days', String(params.days));
  if (params.noBids) query.set('noBids', '1');
  if (params.sort) query.set('sort', params.sort);
  if (params.page && params.page > 1) query.set('page', String(params.page));
  const qs = query.toString();
  return qs ? `/jobs?${qs}` : '/jobs';
}

/** Курсор истории переписки (?before=<id сообщения>); иначе — последние сообщения. */
export function historyCursor(raw: RawParam): string | undefined {
  const value = first(raw);
  return value && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : undefined;
}

/** Итог жалобы без JS (?report=…) → текст сверху страницы; null — нет итога. */
export function reportNotice(raw: RawParam): { text: string; ok: boolean } | null {
  switch (first(raw)) {
    case 'sent':
      return { text: 'Жалоба отправлена. Администратор разберёт её.', ok: true };
    case 'duplicate':
      return { text: 'Вы уже пожаловались: жалоба ждёт разбора.', ok: true };
    case 'invalid':
      return {
        text: 'Жалоба не отправлена: выберите причину, для «Другое» — с пояснением.',
        ok: false,
      };
    case 'gone':
      return { text: 'Жалоба не отправлена: это уже недоступно.', ok: false };
    case 'limit':
      return { text: 'Жалоба не отправлена: слишком много жалоб за сутки.', ok: false };
    case 'failed':
      return { text: 'Жалоба не отправлена: попробуйте позже.', ok: false };
    default:
      return null;
  }
}
