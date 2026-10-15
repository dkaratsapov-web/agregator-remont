import { JOB_CATEGORY_LABELS, type JobDto } from '@agregator/shared';
import Link from 'next/link';
import { formatBudget, formatDate } from '@/lib/format';
import { StatusBadge } from './status-badge';

export function JobCard({ job }: { job: JobDto }) {
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition-[border-color,box-shadow] duration-200 hover:border-ink-soft/40 hover:shadow-raised">
      <div className="flex items-center justify-between gap-3 text-xs text-ink-soft">
        <span className="font-medium">{JOB_CATEGORY_LABELS[job.category]}</span>
        <StatusBadge status={job.status} />
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-ink">
        <Link
          href={`/jobs/${job.id}`}
          className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none group-has-[:focus-visible]:underline"
        >
          {job.title}
        </Link>
      </h3>
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">{job.description}</p>
      <dl className="mt-auto flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pt-5">
        <div>
          <dt className="sr-only">Бюджет</dt>
          <dd className="text-base font-semibold tabular-nums text-ink">
            {formatBudget(job.budgetMin, job.budgetMax, job.currency)}
          </dd>
        </div>
        <div className="text-sm text-ink-soft">
          <dt className="sr-only">Город и дата</dt>
          <dd>
            {job.city}, <time dateTime={job.createdAt}>{formatDate(job.createdAt)}</time>
          </dd>
        </div>
      </dl>
    </article>
  );
}
