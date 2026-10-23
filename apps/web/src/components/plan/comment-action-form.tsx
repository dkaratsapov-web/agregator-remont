'use client';

import { useActionState, useId } from 'react';
import { FormError } from '@/components/auth/form-error';
import type { PlanActionState } from '@/app/(site)/account/plan/actions';
import { PhotoInput } from '@/components/chat/photo-input';
import { FormArgs } from '@/components/ui/form-args';
import type { FormArg } from '@/lib/form-args';

const FIELD =
  'mt-1.5 block w-full rounded-xl border border-line bg-surface px-4 py-3 text-base leading-relaxed text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0';

/**
 * Действие с обязательным комментарием (вернуть план, сдать этап, доработка, отказ). `collapsed`
 * — форма спрятана за раскрытием, чтобы не нажать случайно. Введённое остаётся после ошибки.
 */
export function CommentActionForm({
  args,
  action,
  name = 'comment',
  label,
  hint,
  submitLabel,
  pendingLabel,
  summary,
  tone = 'primary',
  photos = false,
}: {
  action: (state: PlanActionState, form: FormData) => Promise<PlanActionState>;
  /** Параметры действия скрытым полем вместо bind (lib/form-args.ts). */
  args?: readonly FormArg[];
  name?: string;
  label: string;
  hint?: string;
  submitLabel: string;
  pendingLabel: string;
  /** Текст раскрытия; без него форма видна сразу. */
  summary?: string;
  tone?: 'primary' | 'secondary';
  /** Поле «Фото» (фото-отчёт к сдаче этапа). */
  photos?: boolean;
}) {
  const [state, formAction, pending] = useActionState<PlanActionState, FormData>(action, {});
  const id = useId();
  const button =
    tone === 'primary'
      ? 'bg-accent text-accent-ink hover:bg-accent-hover'
      : 'border border-line bg-surface text-ink hover:border-ink/30';
  const form = (
    <form action={formAction} className="space-y-3">
      {args ? <FormArgs values={args} /> : null}
      <FormError message={state.error} login={state.login} />
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        <textarea
          id={id}
          name={name}
          rows={3}
          required
          defaultValue={state.comment ?? ''}
          aria-invalid={state.error && !state.login ? true : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={FIELD}
        />
        {hint ? (
          <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-ink-soft">
            {hint}
          </p>
        ) : null}
      </div>
      {photos ? <PhotoInput label="Фото-отчёт" /> : null}
      <button
        type="submit"
        disabled={pending}
        className={`inline-flex min-h-11 items-center rounded-xl px-5 font-semibold transition-colors duration-150 disabled:cursor-wait disabled:opacity-70 ${button}`}
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
  if (!summary) return form;
  return (
    <details className="group" open={Boolean(state.error)}>
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors duration-150 hover:border-ink/30 [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className="mt-3">{form}</div>
    </details>
  );
}
