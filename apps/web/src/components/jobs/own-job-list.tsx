import type { OwnJobDto } from '@agregator/shared';
import { UnreadPill } from '@/components/notifications/unread-pill';
import { StatusBadge } from '@/components/status-badge';
import { Ledger, LedgerLink } from '@/components/ui/sheet';
import { formatBudget, formatDate } from '@/lib/format';
import { jobCategoryLabels } from './job-details';

/**
 * Заказы заказчика строками ведомости. Рамку даёт лист, в который список вложен. unread —
 * непрочитанные уведомления по заказам (пометка «Новое»).
 */
export function OwnJobList({
  jobs,
  unread = {},
}: {
  jobs: OwnJobDto[];
  unread?: Record<string, number>;
}) {
  return (
    <Ledger>
      {jobs.map((job) => (
        <LedgerLink
          key={job.id}
          href={`/account/jobs/${job.id}`}
          title={job.title}
          meta={
            <>
              {jobCategoryLabels(job).join(', ')} · {job.city} ·{' '}
              <time dateTime={job.createdAt}>{formatDate(job.createdAt)}</time>
            </>
          }
          aside={
            <>
              <UnreadPill count={unread[job.id] ?? 0} />
              <span className="text-sm font-semibold tabular-nums text-ink">
                {formatBudget(job.budgetMin, job.budgetMax, job.currency)}
              </span>
              <StatusBadge status={job.status} />
            </>
          }
        />
      ))}
    </Ledger>
  );
}
