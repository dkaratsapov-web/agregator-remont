'use client';

import { MESSAGE_LIMITS } from '@agregator/shared';
import { useActionState, useId } from 'react';
import { FormError } from '@/components/auth/form-error';
import type { PlanActionState } from '@/app/(site)/account/plan/actions';
import { PhotoInput } from './photo-input';

/** Новое сообщение: текст и/или фото. Введённый текст остаётся после ошибки. */
export function MessageForm({
  action,
}: {
  action: (state: PlanActionState, form: FormData) => Promise<PlanActionState>;
}) {
  const [state, formAction, pending] = useActionState<PlanActionState, FormData>(action, {});
  const id = useId();
  return (
    <form action={formAction} className="space-y-3">
      <FormError message={state.error} login={state.login} />
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          Сообщение
        </label>
        <textarea
          id={id}
          name="body"
          rows={3}
          maxLength={MESSAGE_LIMITS.BODY_MAX}
          defaultValue={state.comment ?? ''}
          aria-invalid={state.error && !state.login ? true : undefined}
          className="mt-1.5 block w-full rounded-xl border border-line bg-surface px-4 py-3 text-base leading-relaxed text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0"
        />
      </div>
      <PhotoInput />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink transition-colors duration-150 hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? 'Отправляем…' : 'Отправить'}
      </button>
    </form>
  );
}
