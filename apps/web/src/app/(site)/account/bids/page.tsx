import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { MyBidList } from '@/components/bids/my-bid-list';
import { ContractorsOnly } from '@/components/jobs/contractors-only';
import { Notice } from '@/components/notice';
import {
  EmptyState,
  PageHeader,
  primaryLinkClass,
  secondaryLinkClass,
} from '@/components/ui/page-header';
import { Sheet, SheetHeader, SheetPager } from '@/components/ui/sheet';
import { listMyBids } from '@/lib/api';
import { requireContractorPage } from '@/lib/customer';
import { getUnreadSummary } from '@/lib/notifications-server';
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
  const summary = getUnreadSummary();
  try {
    data = await listMyBids(token, page, { limit: PAGE_SIZE });
  } catch (error) {
    console.error('My bids: failed to load', error);
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const unreadByJob = Object.fromEntries(
    (await summary)?.jobs.map((j) => [j.jobId, j.unread]) ?? [],
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <PageHeader
        back={{ href: '/account', label: 'Кабинет' }}
        title="Мои отклики"
        description="Цена и срок, которые вы предложили, и что решил заказчик."
        action={
          <Link href="/jobs?open=1" className={primaryLinkClass}>
            Найти заказ
          </Link>
        }
      />
      {query.withdrawn ? (
        <div className="mt-6">
          <Notice>Отклик отозван.</Notice>
        </div>
      ) : null}
      {query.quit ? (
        <div className="mt-6">
          <Notice>
            Вы отказались от заказа. Заказчик увидит причину и сможет выбрать другого исполнителя.
          </Notice>
        </div>
      ) : null}
      <div className="mt-8 max-w-5xl">
        {data === null ? (
          <ApiUnavailable />
        ) : (
          <Sheet labelledBy="bids-title">
            <SheetHeader
              id="bids-title"
              title={
                <>
                  Отклики <span className="tabular-nums text-ink-soft">{data.total}</span>
                </>
              }
            />
            {data.items.length === 0 ? (
              <EmptyState
                title={data.total > 0 ? 'На этой странице пусто' : 'Вы ещё не откликались'}
                action={
                  <Link href="/jobs?open=1" className={secondaryLinkClass}>
                    Открыть каталог
                  </Link>
                }
              >
                Найдите подходящий заказ в каталоге и предложите свою цену и срок.
              </EmptyState>
            ) : (
              <MyBidList
                unread={unreadByJob}
                bids={data.items}
                returnTo={page > 1 ? `/account/bids?page=${page}` : '/account/bids'}
              />
            )}
            <SheetPager href="/account/bids" page={page} totalPages={totalPages} />
          </Sheet>
        )}
      </div>
    </div>
  );
}
