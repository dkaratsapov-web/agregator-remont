'use client';

import { JOB_CATEGORIES, JOB_CATEGORY_LABELS, JOB_LIMITS } from '@agregator/shared';
import { useActionState } from 'react';
import type { JobFormState } from '@/app/(site)/account/jobs/actions';
import { Field } from '@/components/auth/field';
import { FormError } from '@/components/auth/form-error';
import { SubmitButton } from '@/components/auth/submit-button';
import type { JobFormValues } from '@/lib/job-form';

interface Props {
  action: (state: JobFormState, form: FormData) => Promise<JobFormState>;
  initial?: Partial<JobFormValues>;
  submitLabel: string;
  pendingLabel: string;
}

const control =
  'mt-1.5 block w-full rounded-xl border border-line bg-surface px-4 text-base text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0';

export function JobForm({ action, initial = {}, submitLabel, pendingLabel }: Props) {
  const [state, formAction] = useActionState<JobFormState, FormData>(action, {});
  const values = { ...initial, ...state.values };

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <Field
        label="Что нужно сделать"
        name="title"
        required
        minLength={JOB_LIMITS.TITLE_MIN}
        maxLength={JOB_LIMITS.TITLE_MAX}
        autoComplete="off"
        defaultValue={values.title}
        hint="Коротко, например: «Укладка плитки в ванной»"
      />
      <div>
        <label htmlFor="field-category" className="block text-sm font-medium text-ink">
          Категория
        </label>
        {/* key: React 19 сбрасывает форму после action, а <select> не подхватывает новый
            defaultValue без пересоздания — выбранная категория терялась бы после ошибки. */}
        <select
          key={values.category ?? ''}
          id="field-category"
          name="category"
          required
          defaultValue={values.category ?? ''}
          className={`${control} min-h-12`}
        >
          <option value="" disabled>
            Выберите категорию
          </option>
          {JOB_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {JOB_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </div>
      <Field
        label="Город"
        name="city"
        required
        minLength={JOB_LIMITS.CITY_MIN}
        maxLength={JOB_LIMITS.CITY_MAX}
        autoComplete="address-level2"
        defaultValue={values.city}
      />
      <fieldset>
        <legend className="text-sm font-medium text-ink">Бюджет, ₽</legend>
        <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
          <Field
            label="От"
            name="budgetMin"
            inputMode="numeric"
            autoComplete="off"
            maxLength={13}
            defaultValue={values.budgetMin}
          />
          <Field
            label="До"
            name="budgetMax"
            inputMode="numeric"
            autoComplete="off"
            maxLength={13}
            defaultValue={values.budgetMax}
          />
        </div>
        <p className="mt-1.5 text-sm text-ink-soft">
          Оставьте пустым, если бюджет по договорённости.
        </p>
      </fieldset>
      <div>
        <label htmlFor="field-description" className="block text-sm font-medium text-ink">
          Описание работ
        </label>
        <textarea
          id="field-description"
          name="description"
          required
          minLength={JOB_LIMITS.DESCRIPTION_MIN}
          maxLength={JOB_LIMITS.DESCRIPTION_MAX}
          rows={7}
          aria-describedby="field-description-hint"
          defaultValue={values.description}
          className={`${control} py-3 leading-relaxed`}
        />
        <p id="field-description-hint" className="mt-1.5 text-sm text-ink-soft">
          Площадь, материалы, сроки и всё, что поможет подрядчику оценить работу. Не указывайте
          телефон и адрес: контакты появятся в следующих обновлениях.
        </p>
      </div>
      <SubmitButton pending={pendingLabel}>{submitLabel}</SubmitButton>
    </form>
  );
}
