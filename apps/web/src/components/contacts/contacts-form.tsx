'use client';

import { useActionState } from 'react';
import { contactsFormAction, type ContactsFormState } from '@/app/(site)/account/contacts/actions';
import { FormArgs } from '@/components/ui/form-args';

/** «Показать мои контакты» / «Скрыть мои контакты»; работает и без JS. */
export function ContactsForm({
  jobId,
  shared,
  returnTo,
}: {
  jobId: string;
  shared: boolean;
  returnTo: string;
}) {
  const [state, action, pending] = useActionState<ContactsFormState, FormData>(
    contactsFormAction,
    {},
  );
  return (
    <form action={action} className="space-y-1.5">
      <FormArgs values={[jobId, !shared, returnTo]} />
      <button
        type="submit"
        disabled={pending}
        className={
          shared
            ? 'inline-flex min-h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors duration-150 hover:border-ink/30 disabled:cursor-wait disabled:opacity-70'
            : 'inline-flex min-h-11 items-center rounded-[10px] bg-ink px-4 text-sm font-semibold text-surface transition-colors duration-150 hover:bg-ink/85 disabled:cursor-wait disabled:opacity-70'
        }
      >
        {shared ? 'Скрыть мои контакты' : 'Показать мои контакты'}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-accent">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
