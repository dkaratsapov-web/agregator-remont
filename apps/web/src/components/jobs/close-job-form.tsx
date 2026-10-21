'use client';

import { useActionState } from 'react';
import type { JobFormState } from '@/app/(site)/account/jobs/actions';
import { FormError } from '@/components/auth/form-error';
import { FormArgs } from '@/components/ui/form-args';
import type { FormArg } from '@/lib/form-args';

const OUTCOMES = [
  {
    value: 'COMPLETED',
    label: 'Работы выполнены',
    hint: 'Исполнитель закончил работу.',
  },
  {
    value: 'CANCELLED',
    label: 'Заказ отменён',
    hint: 'Работы не будет или она прервана.',
  },
] as const;

/**
 * Закрытие необратимо, поэтому кнопка подтверждения спрятана за отдельным раскрытием.
 * Заказ без исполнителя можно только отменить; у заказа в работе человек выбирает исход.
 */
export function CloseJobForm({
  args,
  action,
  inProgress,
}: {
  action: (state: JobFormState, form: FormData) => Promise<JobFormState>;
  /** Параметры действия скрытым полем вместо bind (lib/form-args.ts). */
  args?: readonly FormArg[];
  /** Исполнитель выбран: нужен исход (выполнен или отменён). */
  inProgress: boolean;
}) {
  const [state, formAction, pending] = useActionState<JobFormState, FormData>(action, {});
  return (
    <details className="group overflow-hidden rounded-[14px] border border-line bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 font-semibold text-ink transition-colors duration-150 hover:bg-canvas sm:px-6 [&::-webkit-details-marker]:hidden">
        {inProgress ? 'Закрыть заказ' : 'Отменить заказ'}
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
        {args ? <FormArgs values={args} /> : null}
        <FormError message={state.error} />
        {inProgress ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold text-ink">Чем закончился заказ?</legend>
            {OUTCOMES.map((outcome) => (
              <label
                key={outcome.value}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors duration-150 has-[:checked]:border-accent has-[:checked]:bg-accent-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
              >
                <input
                  type="radio"
                  name="outcome"
                  value={outcome.value}
                  required
                  className="mt-1 size-4 accent-[var(--accent)]"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">{outcome.label}</span>
                  <span className="block text-sm text-ink-soft">{outcome.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <input type="hidden" name="outcome" value="CANCELLED" />
        )}
        <p className="text-sm leading-relaxed text-ink-soft">
          {inProgress
            ? 'Закрытый заказ нельзя редактировать и открыть снова. Исполнитель увидит исход.'
            : 'Исполнитель ещё не выбран. Отменённый заказ нельзя открыть снова, ожидающие отклики будут отклонены.'}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-xl border border-accent px-5 font-semibold text-accent transition-colors duration-150 hover:bg-accent-tint disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? 'Закрываем…' : inProgress ? 'Закрыть заказ' : 'Да, отменить заказ'}
        </button>
      </form>
    </details>
  );
}
