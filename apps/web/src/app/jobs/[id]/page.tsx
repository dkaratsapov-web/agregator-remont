import { JOB_CATEGORY_LABELS } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { getJob } from '@/lib/api';
import { formatBudget, formatDate } from '@/lib/format';
import { jobsHref } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

// Один запрос к API на рендер, даже если данные нужны и метаданным, и странице.
const loadJob = cache(getJob);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const job = await loadJob((await params).id);
  if (!job) return { title: 'Заказ не найден' };
  return { title: job.title, description: job.description.slice(0, 160) };
}

export default async function JobPage({ params }: { params: Params }) {
  const job = await loadJob((await params).id);
  if (!job) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 md:pt-12">
      <nav aria-label="Навигационная цепочка" className="text-sm text-ink-soft">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/jobs" className="hover:text-ink hover:underline">
              Заказы
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href={jobsHref({ category: job.category })}
              className="hover:text-ink hover:underline"
            >
              {JOB_CATEGORY_LABELS[job.category]}
            </Link>
          </li>
        </ol>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-12">
        <article>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={job.status} />
            <span className="text-sm text-ink-soft">
              Опубликован <time dateTime={job.createdAt}>{formatDate(job.createdAt)}</time>
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            {job.title}
          </h1>
          <h2 className="mt-8 text-lg font-semibold">Описание работ</h2>
          <p className="mt-3 max-w-[65ch] whitespace-pre-line leading-relaxed text-ink-soft">
            {job.description}
          </p>
        </article>

        <aside className="h-fit rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-24">
          <dl className="space-y-4">
            <div>
              <dt className="text-sm text-ink-soft">Бюджет</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {formatBudget(job.budgetMin, job.budgetMax, job.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">Город</dt>
              <dd className="mt-1 font-medium">{job.city}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">Категория</dt>
              <dd className="mt-1 font-medium">{JOB_CATEGORY_LABELS[job.category]}</dd>
            </div>
          </dl>
          <button
            type="button"
            disabled
            aria-describedby="respond-hint"
            className="mt-6 inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-xl bg-muted-tint px-5 font-semibold text-ink-soft"
          >
            Откликнуться
          </button>
          <p id="respond-hint" className="mt-2 text-xs leading-relaxed text-ink-soft">
            Отклики станут доступны после запуска регистрации подрядчиков.
          </p>
        </aside>
      </div>

      <p className="mt-12">
        <Link href="/jobs" className="font-semibold text-accent hover:underline">
          Вернуться к каталогу
        </Link>
      </p>
    </div>
  );
}
