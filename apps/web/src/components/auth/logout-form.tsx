'use client';

import { useActionState } from 'react';
import { logoutAction, type AuthFormState } from '@/app/(auth)/actions';
import { FormError } from './form-error';

export function LogoutForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(logoutAction, {});
  return (
    <form action={action} className="space-y-3">
      <FormError message={state.error} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-xl px-4 font-medium text-ink-soft hover:bg-muted-tint hover:text-ink disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? 'Выходим…' : 'Выйти из аккаунта'}
      </button>
    </form>
  );
}
