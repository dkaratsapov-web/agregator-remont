import {
  JOB_LIMITS,
  JOB_POSTED_DAYS,
  JOB_POSTED_LABELS,
  JOB_SEARCH,
  JOB_SORT_LABELS,
  JOB_SORTS,
  SERVICE_AREA_ERROR,
} from '@agregator/shared';
import Link from 'next/link';
import { CityCombobox } from '@/components/ui/city-combobox';
import { CITY_GROUPS, CITY_OPTIONS } from '@/lib/city-options';
import { formatAmount } from '@/lib/format';
import { activeFilterCount, jobsHref, type JobsFilters } from '@/lib/search-params';

const STATUS_OPTIONS = [
  { value: '', label: 'Все' },
  { value: 'OPEN', label: 'Открытые' },
  { value: 'IN_PROGRESS', label: 'В работе' },
  { value: 'CLOSED', label: 'Закрытые' },
] as const;

const POSTED_OPTIONS = [
  { value: '', label: 'Всё время' },
  ...JOB_POSTED_DAYS.map((days) => ({ value: String(days), label: JOB_POSTED_LABELS[days] })),
];

/** Подпись группы фильтров. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <legend className="px-1 pb-1.5 text-[13px] font-medium text-ink-soft">{children}</legend>;
}

/**
 * Переключатель из нескольких вариантов: обычные радиокнопки, выбранная — тёмная плашка
 * (:has(:checked)). Работает без JS.
 */
function Segmented({
  name,
  options,
  value,
}: {
  name: string;
  options: readonly { value: string; label: string }[];
  value: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-canvas p-1">
      {options.map((option) => (
        <label
          key={option.value || 'all'}
          className="flex min-h-9 cursor-pointer items-center justify-center whitespace-nowrap rounded-xl px-2 text-center text-[13px] font-medium text-ink-soft transition-colors duration-150 hover:text-ink has-[:checked]:bg-ink has-[:checked]:text-canvas has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={value === option.value}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

const fieldClass =
  'min-h-11 w-full min-w-0 rounded-xl bg-canvas px-3.5 text-base text-ink ring-1 ring-transparent placeholder:text-ink-soft focus-visible:outline-none focus-visible:ring-accent';

/**
 * Поиск по каталогу (левая колонка): обычная GET-форма, работает без JS. Категория сохраняется скрытым полем,
 * страница сбрасывается на первую.
 */
export function CatalogSearch({ filters }: { filters: JobsFilters }) {
  const active = activeFilterCount(filters);
  return (
    <form
      action="/jobs"
      method="get"
      role="search"
      aria-label="Фильтры каталога"
      className="rounded-[24px] border border-line/80 bg-surface p-3 shadow-[0_1px_1px_hsl(var(--shadow-color)/0.05),0_12px_32px_-14px_hsl(var(--shadow-color)/0.2)]"
    >
      <p className="px-1 pb-2.5 pt-1 text-sm font-semibold text-ink">Поиск и фильтры</p>
      {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {/* Кольцо фокуса рисует «таблетка» (focus-within), у самого поля второго контура нет. */}
        <label
          data-focus-ring="within"
          className="flex min-h-12 items-center gap-3 rounded-2xl bg-canvas px-4 ring-1 ring-transparent focus-within:ring-accent"
        >
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
            placeholder="Например, плитка"
            minLength={JOB_SEARCH.QUERY_MIN}
            maxLength={JOB_SEARCH.QUERY_MAX}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-soft focus:outline-none"
          />
        </label>
        <div>
          <label htmlFor="catalog-city" className="sr-only">
            Город
          </label>
          <CityCombobox
            id="catalog-city"
            name="city"
            options={CITY_OPTIONS}
            groups={CITY_GROUPS}
            defaultValue={filters.city ?? ''}
            placeholder="Город"
            strict
            emptyMessage={SERVICE_AREA_ERROR}
            maxLength={JOB_LIMITS.CITY_MAX}
          />
        </div>
      </div>
      <div className="mt-4 space-y-4">
        <fieldset>
          <GroupLabel>Статус</GroupLabel>
          <Segmented name="status" options={STATUS_OPTIONS} value={filters.status ?? ''} />
        </fieldset>
        <fieldset>
          <GroupLabel>Бюджет, ₽</GroupLabel>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="sr-only">Бюджет от, ₽</span>
              <input
                name="budgetFrom"
                inputMode="numeric"
                autoComplete="off"
                maxLength={13}
                placeholder="От"
                defaultValue={
                  filters.budgetFrom === undefined ? '' : formatAmount(filters.budgetFrom)
                }
                className={fieldClass}
              />
            </label>
            <label>
              <span className="sr-only">Бюджет до, ₽</span>
              <input
                name="budgetTo"
                inputMode="numeric"
                autoComplete="off"
                maxLength={13}
                placeholder="До"
                defaultValue={filters.budgetTo === undefined ? '' : formatAmount(filters.budgetTo)}
                className={fieldClass}
              />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <GroupLabel>Опубликован за</GroupLabel>
          <Segmented
            name="days"
            options={POSTED_OPTIONS}
            value={filters.days ? String(filters.days) : ''}
          />
        </fieldset>
        <label className="-my-1 flex min-h-10 cursor-pointer items-center gap-2.5 px-1 text-sm text-ink">
          <input
            type="checkbox"
            name="noBids"
            value="1"
            defaultChecked={filters.noBids}
            className="size-4 rounded accent-[var(--accent)]"
          />
          Ещё без откликов
        </label>
        <label className="block">
          <span className="block px-1 pb-1.5 text-[13px] font-medium text-ink-soft">
            Сортировка
          </span>
          <select
            name="sort"
            defaultValue={filters.sort ?? 'new'}
            className={`${fieldClass} appearance-none bg-[length:12px] bg-[right_0.9rem_center] bg-no-repeat pr-9 text-sm`}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' fill='none' stroke='%236b7280' stroke-width='1.6'/%3E%3C/svg%3E\")",
            }}
          >
            {JOB_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {JOB_SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {active > 0 ? (
        <div className="flex items-center justify-between gap-2 px-1 pt-3">
          <span className="text-[13px] text-ink-soft tabular-nums">Фильтров: {active}</span>
          <Link
            href={jobsHref({ category: filters.category })}
            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium text-ink-soft hover:bg-ink/5 hover:text-ink"
          >
            Сбросить
          </Link>
        </div>
      ) : null}
      <button
        type="submit"
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-ink px-6 text-sm font-semibold text-canvas transition-[background-color,transform] duration-200 hover:bg-ink/85 active:scale-[0.97]"
      >
        Найти
      </button>
    </form>
  );
}
