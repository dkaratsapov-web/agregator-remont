'use client';

import { useActionState } from 'react';
import { markAllReadAction, type MarkAllState } from '@/app/(site)/account/notifications/actions';
import { secondaryLinkClass } from '@/components/ui/page-header';

export function MarkAllRead() {
  const [state, action, pending] = useActionState<MarkAllState, FormData>(markAllReadAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <button
        type="submit"
        disabled={pending}
        className={`${secondaryLinkClass} disabled:cursor-wait disabled:opacity-70`}
      >
        {pending ? 'Отмечаем…' : 'Отметить все прочитанными'}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-accent">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
