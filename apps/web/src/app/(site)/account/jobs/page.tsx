import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { CustomersOnly } from '@/components/jobs/customers-only';
import { DraftList } from '@/components/jobs/draft-list';
import { OwnJobList } from '@/components/jobs/own-job-list';
import { listDrafts, listMyJobs } from '@/lib/api';
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

  const [jobsResult, draftsResult] = await Promise.allSettled([
    listMyJobs(token, page, PAGE_SIZE),
    listDrafts(token),
  ]);
  const data = jobsResult.status === 'fulfilled' ? jobsResult.value : null;
  if (jobsResult.status === 'rejected') console.error('My jobs: failed to load', jobsResult.reason);
  // Черновики — дополнение: если не загрузились, список заказов всё равно показываем.
  const drafts = draftsResult.status === 'fulfilled' ? draftsResult.value : [];
  if (draftsResult.status === 'rejected') {
    console.error('My jobs: failed to load drafts', draftsResult.reason);
  }
  const notice =
    params.draftDeleted === '1'
      ? 'Черновик удалён.'
      : params.draftError === '1'
        ? 'Не удалось удалить черновик. Попробуйте позже.'
        : null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
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

      {notice ? (
        <p
          role="status"
          className="mt-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink"
        >
          {notice}
        </p>
      ) : null}

      {drafts.length > 0 && page === 1 ? (
        <section aria-labelledby="drafts-title" className="mt-8">
          <h2 id="drafts-title" className="text-lg font-semibold">
            Черновики <span className="tabular-nums text-ink-soft">{drafts.length}</span>
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Видны только вам. Подрядчики увидят заказ после публикации.
          </p>
          <div className="mt-4">
            <DraftList drafts={drafts} />
          </div>
        </section>
      ) : null}

      <div className="mt-8">
        {drafts.length > 0 && page === 1 && data && data.items.length > 0 ? (
          <h2 className="mb-4 text-lg font-semibold">Опубликованные</h2>
        ) : null}
        {data === null ? (
          <ApiUnavailable />
        ) : data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
            <h2 className="text-lg font-semibold">
              {data.total > 0
                ? 'На этой странице пусто'
                : drafts.length > 0
                  ? 'Опубликованных заказов пока нет'
                  : 'У вас пока нет заказов'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              {drafts.length > 0 && data.total === 0
                ? 'Продолжите черновик выше или создайте новый заказ: после публикации он появится в каталоге.'
                : 'Опишите работы, город и бюджет: заказ сразу появится в каталоге.'}
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
