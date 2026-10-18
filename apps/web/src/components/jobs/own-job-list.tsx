import type { OwnJobDto } from '@agregator/shared';
import { StatusBadge } from '@/components/status-badge';
import { Ledger, LedgerLink } from '@/components/ui/sheet';
import { formatBudget, formatDate } from '@/lib/format';
import { jobCategoryLabels } from './job-details';

/** Заказы заказчика строками ведомости. Рамку даёт лист, в который список вложен. */
export function OwnJobList({ jobs }: { jobs: OwnJobDto[] }) {
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
