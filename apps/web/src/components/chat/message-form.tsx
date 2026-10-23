'use client';

import { MESSAGE_LIMITS } from '@agregator/shared';
import { useActionState, useId, useState } from 'react';
import { FormError } from '@/components/auth/form-error';
import { ContactsHint } from '@/components/moderation/contacts-hint';
import type { PlanActionState } from '@/app/(site)/account/plan/actions';
import { PhotoInput } from './photo-input';
import { FormArgs } from '@/components/ui/form-args';
import type { FormArg } from '@/lib/form-args';

/** Новое сообщение: текст и/или фото. Введённый текст остаётся после ошибки. */
export function MessageForm({
  args,
  action,
}: {
  action: (state: PlanActionState, form: FormData) => Promise<PlanActionState>;
  /** Параметры действия скрытым полем вместо bind (lib/form-args.ts). */
  args?: readonly FormArg[];
}) {
  const [state, formAction, pending] = useActionState<PlanActionState, FormData>(action, {});
  const id = useId();
  const [text, setText] = useState('');
  // После отправки форма очищается (или остаётся введённое при ошибке): подсказка — по нему.
  const [shown, setShown] = useState(state);
  if (shown !== state) {
    setShown(state);
    setText(state.comment ?? '');
  }
  return (
    <form action={formAction} className="space-y-3">
      {args ? <FormArgs values={args} /> : null}
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
          onInput={(event) => setText(event.currentTarget.value)}
          aria-describedby={`${id}-contacts`}
          aria-invalid={state.error && !state.login ? true : undefined}
          className="mt-1.5 block w-full rounded-xl border border-line bg-surface px-4 py-3 text-base leading-relaxed text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0"
        />
        <ContactsHint id={`${id}-contacts`} text={text} />
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
