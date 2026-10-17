import { JOB_CATEGORY_LABELS, PAGINATION } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { CatalogSearch } from '@/components/catalog-search';
import { CategoryFilter } from '@/components/category-filter';
import { JobCard } from '@/components/job-card';
import { Pagination } from '@/components/pagination';
import { getJobs } from '@/lib/api';
import {
  jobsHref,
  parseCategory,
  parseCity,
  parseOpenOnly,
  parsePage,
  parseQuery,
  type JobsFilters,
} from '@/lib/search-params';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const category = parseCategory((await searchParams).category);
  return { title: category ? `Заказы: ${JOB_CATEGORY_LABELS[category]}` : 'Каталог заказов' };
}

export default async function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const filters: JobsFilters = {
    category: parseCategory(params.category),
    q: parseQuery(params.q),
    city: parseCity(params.city),
    openOnly: parseOpenOnly(params.open),
  };
  const searching = Boolean(filters.q || filters.city || filters.openOnly || filters.category);

  let data: Awaited<ReturnType<typeof getJobs>> | null = null;
  try {
    data = await getJobs({
      page,
      limit: PAGINATION.DEFAULT_LIMIT,
      category: filters.category,
      q: filters.q,
      city: filters.city,
      status: filters.openOnly ? 'OPEN' : undefined,
    });
  } catch (error) {
    console.error('Jobs: failed to load', error);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-14">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Каталог</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-[2.6rem]">
            {filters.category ? JOB_CATEGORY_LABELS[filters.category] : 'Заказы на ремонт'}
          </h1>
        </div>
        {data ? (
          <p className="text-ink-soft" aria-live="polite">
            <span className="font-semibold tabular-nums text-ink">{data.total}</span>{' '}
            {plural(data.total, ['заказ', 'заказа', 'заказов'])}
            {filters.city ? ` · ${filters.city}` : ''}
          </p>
        ) : null}
      </header>

      <div className="mt-8">
        <CatalogSearch filters={filters} />
      </div>

      <div className="mt-5">
        <CategoryFilter filters={filters} />
      </div>

      <div className="mt-8">
        {data === null ? (
          <ApiUnavailable
            action={
              <Link
                href={jobsHref({ ...filters, page })}
                className="font-semibold text-accent underline underline-offset-4"
              >
                Повторить
              </Link>
            }
          />
        ) : data.items.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-line bg-surface px-6 py-14 text-center">
            <h2 className="text-lg font-semibold">
              {data.total === 0
                ? searching
                  ? 'Ничего не нашлось'
                  : 'Пока нет заказов'
                : 'На этой странице пусто'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              {data.total === 0
                ? searching
                  ? 'Попробуйте другой запрос, город или категорию.'
                  : 'Новые заказы появятся здесь после публикации.'
                : 'Похоже, страниц меньше, чем указано в адресе.'}
            </p>
            {searching || data.total > 0 ? (
              <Link
                href={data.total === 0 ? '/jobs' : jobsHref(filters)}
                className="mt-6 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-canvas hover:bg-[#1c2536]"
              >
                {data.total === 0 ? 'Все заказы' : 'К первой странице'}
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((job) => (
              <li key={job.id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && data.items.length > 0 ? (
        <Pagination page={page} totalPages={totalPages} filters={filters} />
      ) : null}
    </div>
  );
}
