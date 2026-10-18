import type { JobDto } from '@agregator/shared';
import Link from 'next/link';
import { formatBudget, formatDate } from '@/lib/format';
import { JobHighlights, jobCategoryLabels } from './jobs/job-details';
import { StatusBadge } from './status-badge';

export function JobCard({ job }: { job: JobDto }) {
  return (
    <article className="group relative flex h-full flex-col rounded-[22px] border border-line/80 bg-surface p-5 shadow-[0_1px_1px_hsl(var(--shadow-color)/0.04)] transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-line hover:shadow-[0_18px_40px_-20px_hsl(var(--shadow-color)/0.35)]">
      <div className="flex items-start justify-between gap-3">
        <CategoryChips labels={jobCategoryLabels(job)} />
        <StatusBadge status={job.status} />
      </div>
      <h3 className="mt-4 text-lg font-semibold leading-snug tracking-tight text-ink">
        <Link
          href={`/jobs/${job.id}`}
          className="after:absolute after:inset-0 after:rounded-[22px] focus-visible:outline-none group-has-[:focus-visible]:underline"
        >
          {job.title}
        </Link>
      </h3>
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">{job.description}</p>
      <div className="relative mt-4 empty:hidden">
        <JobHighlights category={job.category} details={job.details} />
      </div>
      <div className="mt-auto pt-5">
        <div className="h-px bg-line/80" />
        <dl className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pt-4">
          <div>
            <dt className="sr-only">Бюджет</dt>
            <dd className="text-base font-semibold tabular-nums text-ink">
              {formatBudget(job.budgetMin, job.budgetMax, job.currency)}
            </dd>
          </div>
          <div className="text-sm text-ink-soft">
            <dt className="sr-only">Город и дата</dt>
            <dd>
              {job.city} · <time dateTime={job.createdAt}>{formatDate(job.createdAt)}</time>
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

/** Категории заказа: первые две и «+N», чтобы карточки в сетке оставались одной высоты. */
function CategoryChips({ labels }: { labels: string[] }) {
  const shown = labels.slice(0, 2);
  const rest = labels.length - shown.length;
  return (
    <span
      className="flex min-w-0 flex-wrap gap-1.5"
      title={labels.length > 2 ? labels.join(', ') : undefined}
    >
      {shown.map((label) => (
        <span
          key={label}
          className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink-soft"
        >
          {label}
        </span>
      ))}
      {rest > 0 ? (
        <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium tabular-nums text-ink-soft">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
