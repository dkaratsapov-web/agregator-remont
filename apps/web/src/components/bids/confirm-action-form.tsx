'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/auth/form-error';
import { FormArgs } from '@/components/ui/form-args';
import type { FormArg } from '@/lib/form-args';

interface State {
  error?: string;
}

/** Действие с подтверждением: кнопка подтверждения спрятана за раскрытием. */
export function ConfirmActionForm({
  args,
  action,
  summary,
  explanation,
  confirmLabel,
  pendingLabel,
}: {
  action: (state: State, form: FormData) => Promise<State>;
  /** Параметры действия скрытым полем вместо bind (lib/form-args.ts). */
  args?: readonly FormArg[];
  summary: string;
  explanation: string;
  confirmLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {});
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors duration-150 hover:border-ink/30 [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <form action={formAction} className="mt-3 space-y-3">
        {args ? <FormArgs values={args} /> : null}
        <FormError message={state.error} />
        <p className="text-sm leading-relaxed text-ink-soft">{explanation}</p>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink transition-colors duration-150 hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? pendingLabel : confirmLabel}
        </button>
      </form>
    </details>
  );
}
