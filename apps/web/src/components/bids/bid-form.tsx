'use client';

import { BID_LIMITS } from '@agregator/shared';
import { useActionState, useRef } from 'react';
import type { BidFormState } from '@/app/(site)/account/bids/actions';
import { Field } from '@/components/auth/field';
import { FormError } from '@/components/auth/form-error';
import { SubmitButton } from '@/components/auth/submit-button';
import { useFocusInvalid } from '@/components/auth/use-focus-invalid';

export function BidForm({
  action,
}: {
  action: (state: BidFormState, form: FormData) => Promise<BidFormState>;
}) {
  const [state, formAction] = useActionState<BidFormState, FormData>(action, {});
  const values = state.values ?? {};
  const fields = state.fields ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  useFocusInvalid(formRef, state);
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Field
        label="Ваша цена, ₽"
        name="price"
        inputMode="numeric"
        autoComplete="off"
        required
        maxLength={13}
        defaultValue={values.price}
        error={fields.price}
      />
      <Field
        label="Срок, дней"
        name="durationDays"
        inputMode="numeric"
        autoComplete="off"
        maxLength={3}
        defaultValue={values.durationDays}
        error={fields.durationDays}
        hint="Необязательно"
      />
      <div>
        <label htmlFor="field-comment" className="block text-sm font-medium text-ink">
          Комментарий для заказчика
        </label>
        <textarea
          id="field-comment"
          name="comment"
          required
          minLength={BID_LIMITS.COMMENT_MIN}
          maxLength={BID_LIMITS.COMMENT_MAX}
          rows={4}
          defaultValue={values.comment}
          aria-invalid={fields.comment ? true : undefined}
          aria-describedby={
            fields.comment ? 'field-comment-error field-comment-hint' : 'field-comment-hint'
          }
          className={`mt-1.5 block w-full rounded-xl border ${fields.comment ? 'border-accent' : 'border-line'} bg-surface px-4 py-3 text-base leading-relaxed text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0`}
        />
        {fields.comment ? (
          <p id="field-comment-error" className="mt-1.5 text-sm font-medium text-accent">
            {fields.comment}
          </p>
        ) : null}
        <p id="field-comment-hint" className="mt-1.5 text-xs leading-relaxed text-ink-soft">
          Опыт, что входит в цену, когда можете начать. Контакты не указывайте: заказчик свяжется с
          выбранным исполнителем через площадку.
        </p>
      </div>
      <SubmitButton pending="Отправляем…">Откликнуться</SubmitButton>
    </form>
  );
}
