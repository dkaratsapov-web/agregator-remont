import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { CustomersOnly } from '@/components/jobs/customers-only';
import { DraftList } from '@/components/jobs/draft-list';
import { OwnJobList } from '@/components/jobs/own-job-list';
import { Notice } from '@/components/notice';
import {
  EmptyState,
  PageHeader,
  primaryLinkClass,
  secondaryLinkClass,
} from '@/components/ui/page-header';
import { Sheet, SheetHeader, SheetPager } from '@/components/ui/sheet';
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

  const showDrafts = drafts.length > 0 && page === 1;

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <PageHeader
        back={{ href: '/account', label: 'Кабинет' }}
        title="Мои заказы"
        description="Черновики видны только вам. Опубликованные заказы — в каталоге, мастера на них откликаются."
        action={
          <Link href="/account/jobs/new" className={primaryLinkClass}>
            Новый заказ
          </Link>
        }
      />

      {notice ? (
        <div className="mt-6">
          <Notice tone={params.draftError === '1' ? 'neutral' : 'ok'}>{notice}</Notice>
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-6">
        {showDrafts ? (
          <Sheet labelledBy="drafts-title" className="border-dashed">
            <SheetHeader
              id="drafts-title"
              title={
                <>
                  Черновики <span className="tabular-nums text-ink-soft">{drafts.length}</span>
                </>
              }
              description="Подрядчики увидят заказ только после публикации."
            />
            <DraftList drafts={drafts} />
          </Sheet>
        ) : null}

        {data === null ? (
          <ApiUnavailable />
        ) : (
          <Sheet labelledBy="published-title">
            <SheetHeader
              id="published-title"
              title={
                <>
                  Опубликованные <span className="tabular-nums text-ink-soft">{data.total}</span>
                </>
              }
            />
            {data.items.length === 0 ? (
              <EmptyState
                title={
                  data.total > 0
                    ? 'На этой странице пусто'
                    : showDrafts
                      ? 'Опубликованных заказов пока нет'
                      : 'У вас пока нет заказов'
                }
                action={
                  data.total > 0 ? (
                    <Link href="/account/jobs" className={secondaryLinkClass}>
                      К первой странице
                    </Link>
                  ) : null
                }
              >
                {showDrafts && data.total === 0
                  ? 'Продолжите черновик выше или создайте новый заказ: после публикации он появится в каталоге.'
                  : data.total > 0
                    ? undefined
                    : 'Опишите работы, город и бюджет: заказ сразу появится в каталоге.'}
              </EmptyState>
            ) : (
              <OwnJobList jobs={data.items} />
            )}
            <SheetPager href="/account/jobs" page={page} totalPages={totalPages} />
          </Sheet>
        )}
      </div>
    </div>
  );
}
