import {
  isJobCategory,
  JOB_LIMITS,
  JOB_SEARCH,
  type JobCategory,
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

/** «Только открытые»: ?open=1. */
export function parseOpenOnly(raw: RawParam): boolean {
  return first(raw) === '1';
}

export interface JobsFilters {
  category?: JobCategory;
  q?: string;
  city?: string;
  openOnly?: boolean;
}

export function jobsHref(params: JobsFilters & { page?: number }): string {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.city) query.set('city', params.city);
  if (params.category) query.set('category', params.category);
  if (params.openOnly) query.set('open', '1');
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
