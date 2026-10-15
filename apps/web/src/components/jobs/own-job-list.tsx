import { JOB_CATEGORY_LABELS, type OwnJobDto } from '@agregator/shared';
import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import { formatBudget, formatDate } from '@/lib/format';

export function OwnJobList({ jobs }: { jobs: OwnJobDto[] }) {
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {jobs.map((job) => (
        <li key={job.id}>
          <Link
            href={`/account/jobs/${job.id}`}
            className="flex flex-col gap-1.5 px-5 py-4 transition-colors duration-150 hover:bg-muted-tint sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <span className="min-w-0">
              <span className="block break-words font-semibold">{job.title}</span>
              <span className="mt-0.5 block text-sm text-ink-soft">
                {JOB_CATEGORY_LABELS[job.category]}, {job.city},{' '}
                <time dateTime={job.createdAt}>{formatDate(job.createdAt)}</time>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="text-sm font-semibold tabular-nums">
                {formatBudget(job.budgetMin, job.budgetMax, job.currency)}
              </span>
              <StatusBadge status={job.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
