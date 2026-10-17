import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { CustomersOnly } from '@/components/jobs/customers-only';
import { OwnJobList } from '@/components/jobs/own-job-list';
import { listMyJobs } from '@/lib/api';
import { requireCustomerPage } from '@/lib/customer';
import { parsePage } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Мои заказы', robots: { index: false } };

const PAGE_SIZE = 20;

export default async function MyJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, params] = await Promise.all([
    requireCustomerPage('/account/jobs'),
    searchParams,
  ]);
  if (!token) return <CustomersOnly />;
  const page = parsePage(params.page);

  let data: Awaited<ReturnType<typeof listMyJobs>> | null = null;
  try {
    data = await listMyJobs(token, page, PAGE_SIZE);
  } catch (error) {
    console.error('My jobs: failed to load', error);
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 md:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-soft">
            <Link href="/account" className="hover:text-ink hover:underline">
              Кабинет
            </Link>
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Мои заказы</h1>
        </div>
        <Link
          href="/account/jobs/new"
          className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink transition-colors duration-150 hover:bg-accent-hover"
        >
          Новый заказ
        </Link>
      </div>

      <div className="mt-8">
        {data === null ? (
          <ApiUnavailable />
        ) : data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
            <h2 className="text-lg font-semibold">
              {data.total === 0 ? 'У вас пока нет заказов' : 'На этой странице пусто'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              Опишите работы, город и бюджет: заказ сразу появится в каталоге.
            </p>
          </div>
        ) : (
          <OwnJobList jobs={data.items} />
        )}
      </div>

      {data && totalPages > 1 ? (
        <nav aria-label="Страницы" className="mt-6 flex justify-between text-sm font-medium">
          {page > 1 ? (
            <Link href={`/account/jobs?page=${page - 1}`} className="text-accent hover:underline">
              Назад
            </Link>
          ) : (
            <span />
          )}
          <span className="tabular-nums text-ink-soft">
            {page} из {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`/account/jobs?page=${page + 1}`} className="text-accent hover:underline">
              Вперёд
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
