import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiUnavailable } from '@/components/api-unavailable';
import { ContractorsOnly } from '@/components/jobs/contractors-only';
import { JobChatPanel } from '@/components/chat/job-chat-panel';
import { Notice } from '@/components/notice';
import { JobPlanPanel } from '@/components/plan/job-plan-panel';
import { planNotice } from '@/components/plan/plan-notice';
import { StatusBadge } from '@/components/status-badge';
import { PageHeader, secondaryLinkClass } from '@/components/ui/page-header';
import { getMessages, getPlan, listMyBids } from '@/lib/api';
import { requireContractorPage } from '@/lib/customer';
import { MarkSeen } from '@/components/notifications/mark-seen';
import { getUnreadSummary, unreadForJob } from '@/lib/notifications-server';

export const metadata: Metadata = { title: 'Ход работ', robots: { index: false } };

type Params = Promise<{ jobId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** «Ход работ» исполнителя: план и этапы заказа, где выбран его отклик. */
export default async function WorkPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ jobId }, query] = await Promise.all([params, searchParams]);
  const path = `/account/work/${jobId}`;
  const { token } = await requireContractorPage(path);
  if (!token) return <ContractorsOnly />;

  let plan: Awaited<ReturnType<typeof getPlan>>;
  let chat: Awaited<ReturnType<typeof getMessages>> = null;
  let job:
    | { id: string; title: string; city: string; status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED' }
    | undefined;
  try {
    plan = /^[A-Za-z0-9_-]{1,64}$/.test(jobId) ? await getPlan(token, jobId) : null;
    if (plan) {
      const [bids, messages] = await Promise.all([
        listMyBids(token, 1, { jobId, limit: 1 }),
        getMessages(token, jobId),
      ]);
      job = bids.items[0]?.job;
      chat = messages;
    }
  } catch (error) {
    console.error('Work: failed to load', error);
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <ApiUnavailable />
      </div>
    );
  }
  if (!plan || !job) notFound();
  const notice = planNotice(query.plan);
  const summary = await getUnreadSummary();

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <MarkSeen jobId={job.id} unread={unreadForJob(summary, job.id)} />
      <PageHeader
        back={{ href: '/account/bids', label: 'Мои отклики' }}
        title={job.title}
        action={
          <Link href={`/jobs/${job.id}`} className={secondaryLinkClass}>
            Карточка заказа
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status} />
          <span className="text-sm text-ink-soft">{job.city}</span>
        </div>
      </PageHeader>
      {notice ? (
        <div className="mt-6">
          <Notice>{notice}</Notice>
        </div>
      ) : null}
      <div className="mt-8 flex max-w-4xl flex-col gap-8">
        <JobPlanPanel plan={plan} jobOpen={job.status === 'IN_PROGRESS'} returnTo={path} />
        {chat ? <JobChatPanel chat={chat} requestId={crypto.randomUUID()} returnTo={path} /> : null}
      </div>
    </div>
  );
}
