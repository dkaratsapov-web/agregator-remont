import { JOB_CATEGORY_LABELS, PAGINATION } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { CategoryFilter } from '@/components/category-filter';
import { JobCard } from '@/components/job-card';
import { Pagination } from '@/components/pagination';
import { getJobs } from '@/lib/api';
import { jobsHref, parseCategory, parsePage } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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
  const category = parseCategory(params.category);

  let data: Awaited<ReturnType<typeof getJobs>> | null = null;
  try {
    data = await getJobs({ page, limit: PAGINATION.DEFAULT_LIMIT, category });
  } catch (error) {
    console.error('Jobs: failed to load', error);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-14">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {category ? JOB_CATEGORY_LABELS[category] : 'Каталог заказов'}
        </h1>
        {data ? (
          <p className="mt-2 text-ink-soft">
            Найдено заказов: <span className="tabular-nums">{data.total}</span>
          </p>
        ) : null}
      </header>

      <div className="mt-6">
        <CategoryFilter active={category} />
      </div>

      <div className="mt-8">
        {data === null ? (
          <ApiUnavailable
            action={
              <Link
                href={jobsHref({ page, category })}
                className="font-semibold text-accent underline underline-offset-4"
              >
                Повторить
              </Link>
            }
          />
        ) : data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
            <h2 className="text-lg font-semibold">
              {data.total === 0 ? 'В этой категории пока нет заказов' : 'На этой странице пусто'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              {data.total === 0
                ? 'Новые заказы появятся здесь после публикации. Посмотрите другие категории.'
                : 'Похоже, страниц меньше, чем указано в адресе.'}
            </p>
            <Link
              href={data.total === 0 ? '/jobs' : jobsHref({ category })}
              className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink hover:bg-accent-hover"
            >
              {data.total === 0 ? 'Все заказы' : 'К первой странице'}
            </Link>
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
        <Pagination page={page} totalPages={totalPages} category={category} />
      ) : null}
    </div>
  );
}
