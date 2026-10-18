'use client';

import { useActionState } from 'react';
import { setLeadProcessedAction, type LeadToggleState } from '@/app/(site)/admin/leads/actions';

export function LeadToggle({
  id,
  processed,
  returnTo,
}: {
  id: string;
  processed: boolean;
  returnTo: string;
}) {
  const [state, action, pending] = useActionState<LeadToggleState, FormData>(
    setLeadProcessedAction.bind(null, id, !processed, returnTo),
    {},
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <button
        type="submit"
        disabled={pending}
        className={`inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold transition-colors duration-150 disabled:cursor-wait disabled:opacity-70 ${
          processed
            ? 'border border-line bg-surface text-ink hover:border-ink-soft/50'
            : 'bg-ink text-canvas hover:bg-ink/85'
        }`}
      >
        {pending ? 'Сохраняем…' : processed ? 'Вернуть в новые' : 'Обработана'}
      </button>
      {state.error ? (
        <p role="alert" className="text-right text-xs text-accent">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
