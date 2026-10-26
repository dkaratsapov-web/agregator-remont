'use client';

import { FEEDBACK_LIMITS } from '@agregator/shared';
import { useActionState } from 'react';
import {
  replyFeedbackFormAction,
  type FeedbackReplyState,
} from '@/app/(site)/admin/feedback/actions';
import { FormArgs } from '@/components/ui/form-args';

/** Ответ администратора на обращение; после ответа страница обновляется. */
export function FeedbackReply({ id, returnTo }: { id: string; returnTo: string }) {
  const [state, action, pending] = useActionState<FeedbackReplyState, FormData>(
    replyFeedbackFormAction,
    {},
  );
  return (
    <form action={action} className="mt-3 space-y-2">
      <FormArgs values={[id, returnTo]} />
      <label htmlFor={`reply-${id}`} className="block text-sm font-medium text-ink">
        Ответ
      </label>
      <textarea
        id={`reply-${id}`}
        name="reply"
        required
        minLength={FEEDBACK_LIMITS.REPLY_MIN}
        maxLength={FEEDBACK_LIMITS.REPLY_MAX}
        rows={3}
        defaultValue={state.reply}
        className="block w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
      />
      {state.error ? (
        <p role="alert" className="text-sm text-accent">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-canvas transition-colors duration-150 hover:bg-ink/85 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? 'Отправляем…' : 'Ответить'}
      </button>
    </form>
  );
}
