import { JOB_LIMITS, JOB_SEARCH } from '@agregator/shared';
import Link from 'next/link';
import { RU_CITIES } from '@/lib/cities';
import { jobsHref, type JobsFilters } from '@/lib/search-params';

/**
 * Поиск по каталогу (левая колонка): обычная GET-форма, работает без JS. Категория сохраняется скрытым полем,
 * страница сбрасывается на первую.
 */
export function CatalogSearch({ filters }: { filters: JobsFilters }) {
  const active = Boolean(filters.q || filters.city || filters.openOnly);
  return (
    <form
      action="/jobs"
      method="get"
      role="search"
      aria-label="Поиск заказов"
      className="rounded-[24px] border border-line/80 bg-surface p-3 shadow-[0_1px_1px_hsl(var(--shadow-color)/0.05),0_12px_32px_-14px_hsl(var(--shadow-color)/0.2)]"
    >
      <p className="px-1 pb-2.5 pt-1 text-sm font-semibold text-ink">Поиск и фильтры</p>
      {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-canvas px-4 ring-1 ring-transparent focus-within:ring-accent">
          <svg
            viewBox="0 0 20 20"
            className="size-4 shrink-0 text-ink-soft"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="m13.5 13.5 4 4" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Что ищем</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Что сделать: плитка, электрика…"
            minLength={JOB_SEARCH.QUERY_MIN}
            maxLength={JOB_SEARCH.QUERY_MAX}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-soft/70 focus:outline-none"
          />
        </label>
        <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-canvas px-4 ring-1 ring-transparent focus-within:ring-accent">
          <svg
            viewBox="0 0 20 20"
            className="size-4 shrink-0 text-ink-soft"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M10 18s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" strokeLinejoin="round" />
            <circle cx="10" cy="8" r="2.2" />
          </svg>
          <span className="sr-only">Город</span>
          <input
            name="city"
            defaultValue={filters.city}
            placeholder="Город"
            list="catalog-cities"
            minLength={JOB_LIMITS.CITY_MIN}
            maxLength={JOB_LIMITS.CITY_MAX}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-soft/70 focus:outline-none"
          />
          <datalist id="catalog-cities">
            {RU_CITIES.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="open"
            value="1"
            defaultChecked={filters.openOnly}
            className="size-4 rounded accent-[var(--accent)]"
          />
          Только открытые заказы
        </label>
        {active ? (
          <Link
            href={jobsHref({ category: filters.category })}
            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium text-ink-soft hover:bg-ink/5 hover:text-ink"
          >
            Сбросить
          </Link>
        ) : null}
      </div>
      <button
        type="submit"
        className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-ink px-6 text-sm font-semibold text-canvas transition-[background-color,transform] duration-200 hover:bg-ink/85 active:scale-[0.97]"
      >
        Найти
      </button>
    </form>
  );
}
