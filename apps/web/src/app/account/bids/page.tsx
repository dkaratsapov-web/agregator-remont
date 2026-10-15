import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { MyBidList } from '@/components/bids/my-bid-list';
import { ContractorsOnly } from '@/components/jobs/contractors-only';
import { Notice } from '@/components/notice';
import { listMyBids } from '@/lib/api';
import { requireContractorPage } from '@/lib/customer';
import { parsePage } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Мои отклики', robots: { index: false } };

const PAGE_SIZE = 20;

export default async function MyBidsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([
    requireContractorPage('/account/bids'),
    searchParams,
  ]);
  if (!token) return <ContractorsOnly />;
  const page = parsePage(query.page);

  let data: Awaited<ReturnType<typeof listMyBids>> | null = null;
  try {
    data = await listMyBids(token, page, { limit: PAGE_SIZE });
  } catch (error) {
    console.error('My bids: failed to load', error);
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 md:pt-14">
      <p className="text-sm text-ink-soft">
        <Link href="/account" className="hover:text-ink hover:underline">
          Кабинет
        </Link>
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Мои отклики</h1>
      {query.withdrawn ? (
        <div className="mt-6">
          <Notice>Отклик отозван.</Notice>
        </div>
      ) : null}
      <div className="mt-8">
        {data === null ? (
          <ApiUnavailable />
        ) : data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
            <h2 className="text-lg font-semibold">Вы ещё не откликались</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              Найдите подходящий заказ в каталоге и предложите свою цену.
            </p>
            <Link
              href="/jobs"
              className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink hover:bg-accent-hover"
            >
              Открыть каталог
            </Link>
          </div>
        ) : (
          <MyBidList
            bids={data.items}
            returnTo={page > 1 ? `/account/bids?page=${page}` : '/account/bids'}
          />
        )}
      </div>
      {data && totalPages > 1 ? (
        <nav aria-label="Страницы" className="mt-6 flex justify-between text-sm font-medium">
          {page > 1 ? (
            <Link href={`/account/bids?page=${page - 1}`} className="text-accent hover:underline">
              Назад
            </Link>
          ) : (
            <span />
          )}
          <span className="tabular-nums text-ink-soft">
            {page} из {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`/account/bids?page=${page + 1}`} className="text-accent hover:underline">
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
