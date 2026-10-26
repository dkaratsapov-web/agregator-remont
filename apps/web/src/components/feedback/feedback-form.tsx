'use client';

import { FEEDBACK_KIND_LABELS, FEEDBACK_KINDS, FEEDBACK_LIMITS } from '@agregator/shared';
import { useActionState } from 'react';
import { sendFeedbackAction, type FeedbackFormState } from '@/app/(site)/account/feedback/actions';
import { SubmitButton } from '@/components/auth/submit-button';
import { FormStatus } from '@/components/account/form-status';

const HINTS = {
  BUG: 'Что делали, что ожидали и что произошло',
  IDEA: 'Чего не хватает и как это помогло бы',
  QUESTION: 'Спросите, ответим здесь же',
} as const;

/**
 * Обращение в поддержку: вид, текст и страница, с которой пришли (скрытое поле, приходит в
 * адресе ?from=). Работает без JS: обычная форма Server Action.
 */
export function FeedbackForm({ from }: { from?: string }) {
  const [state, action] = useActionState<FeedbackFormState, FormData>(sendFeedbackAction, {});
  const kind = state.values?.kind || 'BUG';
  return (
    <form action={action} className="space-y-5">
      <FormStatus error={state.error} />
      {from ? <input type="hidden" name="page" value={from} /> : null}
      <fieldset>
        <legend className="text-sm font-medium text-ink">Что случилось</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {FEEDBACK_KINDS.map((value) => (
            <label
              key={value}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 has-[:checked]:border-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
            >
              <input
                type="radio"
                name="kind"
                value={value}
                defaultChecked={kind === value}
                className="mt-1 size-4 shrink-0 accent-[var(--ink)]"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">
                  {FEEDBACK_KIND_LABELS[value]}
                </span>
                <span className="mt-0.5 block text-sm text-ink-soft">{HINTS[value]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="feedback-body" className="block text-sm font-medium text-ink">
          Текст обращения
        </label>
        <textarea
          id="feedback-body"
          name="body"
          required
          minLength={FEEDBACK_LIMITS.BODY_MIN}
          maxLength={FEEDBACK_LIMITS.BODY_MAX}
          rows={5}
          defaultValue={state.values?.body}
          aria-describedby="feedback-body-hint"
          className="mt-1.5 block w-full rounded-[10px] border border-line bg-surface px-4 py-3 text-base text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
        />
        <p id="feedback-body-hint" className="mt-1.5 text-sm text-ink-soft">
          От {FEEDBACK_LIMITS.BODY_MIN} до {FEEDBACK_LIMITS.BODY_MAX} символов. Пароли и данные карт
          не пишите.
        </p>
      </div>
      <div className="max-w-xs">
        <SubmitButton pending="Отправляем…">Отправить</SubmitButton>
      </div>
    </form>
  );
}
