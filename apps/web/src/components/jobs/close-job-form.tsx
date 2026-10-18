'use client';

import { useActionState } from 'react';
import type { JobFormState } from '@/app/(site)/account/jobs/actions';
import { FormError } from '@/components/auth/form-error';

/** Закрытие необратимо, поэтому кнопка подтверждения спрятана за отдельным раскрытием. */
export function CloseJobForm({
  action,
}: {
  action: (state: JobFormState, form: FormData) => Promise<JobFormState>;
}) {
  const [state, formAction, pending] = useActionState<JobFormState, FormData>(action, {});
  return (
    <details className="group overflow-hidden rounded-[14px] border border-line bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 font-semibold text-ink transition-colors duration-150 hover:bg-canvas sm:px-6 [&::-webkit-details-marker]:hidden">
        Закрыть заказ
        <svg
          viewBox="0 0 16 16"
          className="size-4 text-ink-soft transition-transform duration-200 group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <form action={formAction} className="space-y-3 border-t border-line px-5 py-4 sm:px-6">
        <FormError message={state.error} />
        <p className="text-sm leading-relaxed text-ink-soft">
          Закрытый заказ нельзя редактировать и открыть снова. Подрядчики увидят, что он закрыт.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-xl border border-accent px-5 font-semibold text-accent transition-colors duration-150 hover:bg-accent-tint disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? 'Закрываем…' : 'Да, закрыть заказ'}
        </button>
      </form>
    </details>
  );
}
