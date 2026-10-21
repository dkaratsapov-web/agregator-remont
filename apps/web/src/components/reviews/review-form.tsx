'use client';

import { REVIEW_LIMITS } from '@agregator/shared';
import { useActionState, useId } from 'react';
import { createReviewAction, type ReviewFormState } from '@/app/(site)/account/reviews/actions';
import { FormError } from '@/components/auth/form-error';

const LABELS = ['', 'Плохо', 'Есть замечания', 'Нормально', 'Хорошо', 'Отлично'];

/** Оценка 1–5 и отзыв об исполнителе; работает и без JS (номер заказа — скрытое поле). */
export function ReviewForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(
    createReviewAction,
    {},
  );
  const id = useId();
  const chosen = state.values?.rating;
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} login={state.login} />
      <input type="hidden" name="jobId" value={jobId} />
      <fieldset>
        <legend className="text-sm font-medium text-ink">Оценка</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {[5, 4, 3, 2, 1].map((score) => (
            <label
              key={score}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-surface px-3.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
            >
              <input
                type="radio"
                name="rating"
                value={score}
                required
                defaultChecked={chosen === String(score)}
                className="sr-only"
              />
              <span aria-hidden="true" className="text-accent">
                {'★'.repeat(score)}
              </span>
              <span>
                {score} — {LABELS[score]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          Отзыв <span className="font-normal text-ink-soft">(необязательно)</span>
        </label>
        <textarea
          id={id}
          name="text"
          rows={4}
          maxLength={REVIEW_LIMITS.TEXT_MAX}
          defaultValue={state.values?.text ?? ''}
          className="mt-1.5 block w-full rounded-xl border border-line bg-surface px-4 py-3 text-base leading-relaxed text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0"
        />
        <p className="mt-1.5 text-xs text-ink-soft">
          Что понравилось, что можно улучшить. Отзыв увидят другие заказчики на карточке мастера;
          изменить его потом нельзя.
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink transition-colors duration-150 hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? 'Отправляем…' : 'Оставить отзыв'}
      </button>
    </form>
  );
}
