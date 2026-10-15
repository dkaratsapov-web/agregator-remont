'use client';

import { useActionState } from 'react';
import type { JobFormState } from '@/app/account/jobs/actions';
import { FormError } from '@/components/auth/form-error';

/** Закрытие необратимо, поэтому кнопка подтверждения спрятана за отдельным раскрытием. */
export function CloseJobForm({
  action,
}: {
  action: (state: JobFormState, form: FormData) => Promise<JobFormState>;
}) {
  const [state, formAction, pending] = useActionState<JobFormState, FormData>(action, {});
  return (
    <details className="group rounded-2xl border border-line bg-surface p-5">
      <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">
        Закрыть заказ
        <span className="ml-2 font-normal text-ink-soft group-open:hidden">(показать)</span>
      </summary>
      <form action={formAction} className="mt-4 space-y-3">
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
