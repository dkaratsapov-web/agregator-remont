import { JOB_STATUS_LABELS, PAGINATION, type JobStatus } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { UnreadPill } from '@/components/notifications/unread-pill';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { Sheet, SheetHeader } from '@/components/ui/sheet';
import { listMyBids, listMyJobs } from '@/lib/api';
import { requireUserPage } from '@/lib/customer';
import { getUnreadSummary, unreadForJob } from '@/lib/notifications-server';

export const metadata: Metadata = { title: 'Переписки', robots: { index: false } };

interface Deal {
  jobId: string;
  title: string;
  status: JobStatus;
  href: string;
}

/**
 * Переписки: сделки с выбранным исполнителем (заказ в работе или закрыт), новые сообщения
 * отмечены. Переписка открыта, пока заказ в работе; после закрытия остаётся для чтения.
 */
export default async function ChatsPage() {
  const { token, user } = await requireUserPage('/account/chats');
  let deals: Deal[] | null = null;
  try {
    if (user.role === 'CUSTOMER') {
      const jobs = await listMyJobs(token, 1, PAGINATION.MAX_LIMIT);
      deals = jobs.items
        .filter((job) => job.status !== 'OPEN')
        .map((job) => ({
          jobId: job.id,
          title: job.title,
          status: job.status,
          href: `/account/jobs/${job.id}#chat`,
        }));
    } else if (user.role === 'CONTRACTOR') {
      const bids = await listMyBids(token, 1, { limit: PAGINATION.MAX_LIMIT });
      deals = bids.items
        .filter((bid) => bid.status === 'ACCEPTED')
        .map((bid) => ({
          jobId: bid.job.id,
          title: bid.job.title,
          status: bid.job.status,
          href: `/account/work/${bid.job.id}#chat`,
        }));
    } else {
      deals = [];
    }
  } catch (error) {
    console.error('Chats: failed to load', error);
  }
  const summary = await getUnreadSummary();

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <PageHeader
        back={{ href: '/account', label: 'Кабинет' }}
        title="Переписки"
        description="Переписка с исполнителем или заказчиком по каждому заказу в работе: сообщения и фото. После закрытия заказа она остаётся для чтения."
      />
      <div className="mt-8 max-w-3xl">
        {deals === null ? (
          <ApiUnavailable />
        ) : (
          <Sheet labelledBy="chats-title">
            <SheetHeader id="chats-title" title="Сделки" />
            {deals.length === 0 ? (
              <EmptyState title="Переписок пока нет">
                {user.role === 'CONTRACTOR'
                  ? 'Переписка появится, когда заказчик выберет вас исполнителем.'
                  : 'Переписка появится, когда вы выберете исполнителя по заказу.'}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {deals.map((deal) => {
                  const unread = unreadForJob(summary, deal.jobId);
                  return (
                    <li key={deal.jobId}>
                      <Link
                        href={deal.href}
                        className="flex min-h-14 items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted-tint sm:px-6"
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold text-ink [overflow-wrap:anywhere]">
                            {deal.title}
                          </span>
                          <span className="text-sm text-ink-soft">
                            {JOB_STATUS_LABELS[deal.status]}
                          </span>
                        </span>
                        {unread > 0 ? <UnreadPill count={unread} /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Sheet>
        )}
      </div>
    </div>
  );
}
