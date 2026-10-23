import type { JobDraftDto } from '@agregator/shared';
import type { Metadata } from 'next';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { CustomersOnly } from '@/components/jobs/customers-only';
import { JobForm } from '@/components/jobs/job-form';
import { getDraft } from '@/lib/api';
import { isEntityId } from '@/lib/action-helpers';
import { requireCustomerPage } from '@/lib/customer';
import { formatAmount } from '@/lib/format';
import { loadPriceEstimates } from '@/lib/price-estimate-server';
import type { JobFormValues } from '@/lib/job-form';
import { createJobAction } from '../actions';

export const metadata: Metadata = { title: 'Новый заказ', robots: { index: false } };

/** Значения формы из черновика: пустые поля остаются пустыми. */
function draftValues(draft: JobDraftDto): Partial<JobFormValues> {
  return {
    title: draft.title ?? '',
    description: draft.description ?? '',
    category: draft.category ?? '',
    city: draft.city ?? '',
    budgetMin: draft.budgetMin === null ? '' : formatAmount(draft.budgetMin),
    budgetMax: draft.budgetMax === null ? '' : formatAmount(draft.budgetMax),
    details: JSON.stringify(draft.details),
    extraItems: JSON.stringify(draft.extraItems),
  };
}

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token, user }, params] = await Promise.all([
    requireCustomerPage('/account/jobs/new'),
    searchParams,
  ]);
  if (!token) return <CustomersOnly />;

  const requested = typeof params.draft === 'string' ? params.draft : null;
  const loadDraft = async (): Promise<JobDraftDto | null> => {
    if (!requested || !isEntityId(requested)) return null;
    try {
      return await getDraft(token, requested);
    } catch (error) {
      console.error('New job: failed to load draft', error);
      return null;
    }
  };
  // Оценки — по городу профиля; город черновика, если другой, форма возьмёт из оценок по
  // всем городам.
  const [draft, priceEstimates] = await Promise.all([
    loadDraft(),
    loadPriceEstimates(token, user.city),
  ]);
  const draftMissing = Boolean(requested && isEntityId(requested)) && draft === null;

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <p className="text-sm text-ink-soft">
        <Link
          href="/account/jobs"
          className="inline-flex min-h-6 items-center hover:text-ink hover:underline"
        >
          Мои заказы
        </Link>
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        {draft ? 'Черновик заказа' : 'Новый заказ'}
      </h1>
      <p className="mt-2 text-ink-soft">
        {draft
          ? 'Продолжайте с того места, где остановились. Изменения сохраняются сами.'
          : 'Три коротких шага. После публикации заказ сразу появится в каталоге.'}
      </p>
      {draftMissing ? (
        <p
          role="status"
          className="mt-6 max-w-2xl rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink"
        >
          Черновик не найден: возможно, он уже опубликован или удалён. Начните новый заказ.
        </p>
      ) : null}
      <div className="mt-8">
        <JobForm
          // Новый ключ на каждый черновик: форма не переносит состояние между черновиками.
          key={draft?.id ?? 'new'}
          action={createJobAction}
          initial={draft ? draftValues(draft) : undefined}
          draftId={draft?.id ?? null}
          draftVersion={draft?.updatedAt ?? null}
          requestId={randomUUID()}
          priceEstimates={priceEstimates}
          submitLabel="Опубликовать заказ"
          pendingLabel="Публикуем…"
        />
      </div>
    </div>
  );
}
