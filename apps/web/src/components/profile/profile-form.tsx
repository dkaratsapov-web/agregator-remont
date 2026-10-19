'use client';

import { JOB_CATEGORIES, JOB_CATEGORY_LABELS, PROFILE_LIMITS } from '@agregator/shared';
import { useActionState, useRef } from 'react';
import type { ProfileFormState } from '@/app/(site)/account/profile/actions';
import { Field } from '@/components/auth/field';
import { FormError } from '@/components/auth/form-error';
import { SubmitButton } from '@/components/auth/submit-button';
import { useFocusInvalid } from '@/components/auth/use-focus-invalid';
import type { ProfileFormValues } from '@/lib/bid-form';

export function ProfileForm({
  action,
  initial,
}: {
  action: (state: ProfileFormState, form: FormData) => Promise<ProfileFormState>;
  initial: ProfileFormValues;
}) {
  const [state, formAction] = useActionState<ProfileFormState, FormData>(action, {});
  const values = state.values ?? initial;
  // key: после ошибки React сбрасывает форму; чекбоксы пересоздаются с сохранёнными значениями.
  const formKey = values.categories.join(',');
  const fields = state.fields ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  useFocusInvalid(formRef, state);
  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      <FormError message={state.error} />
      <fieldset
        key={formKey}
        aria-invalid={fields.categories ? true : undefined}
        aria-describedby={fields.categories ? 'field-categories-error' : undefined}
      >
        <legend className="text-sm font-medium text-ink">Категории работ</legend>
        {fields.categories ? (
          <p id="field-categories-error" className="mt-1 text-sm font-medium text-accent">
            {fields.categories}
          </p>
        ) : null}
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {JOB_CATEGORIES.map((category) => (
            <label
              key={category}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors duration-150 hover:border-ink/30 has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-canvas has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
            >
              <input
                type="checkbox"
                name="categories"
                value={category}
                defaultChecked={values.categories.includes(category)}
                className="size-4 accent-[var(--accent)]"
              />
              {JOB_CATEGORY_LABELS[category]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Города"
        name="cities"
        autoComplete="off"
        defaultValue={values.cities}
        error={fields.cities}
        hint={`Через запятую, до ${PROFILE_LIMITS.CITIES_MAX} городов`}
      />
      <Field
        label="Опыт, лет"
        name="experienceYears"
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        defaultValue={values.experienceYears}
        error={fields.experienceYears}
      />
      <div>
        <label htmlFor="field-about" className="block text-sm font-medium text-ink">
          О себе
        </label>
        <textarea
          id="field-about"
          name="about"
          maxLength={PROFILE_LIMITS.ABOUT_MAX}
          rows={6}
          defaultValue={values.about}
          aria-describedby="field-about-hint"
          className="mt-1.5 block w-full rounded-xl border border-line bg-surface px-4 py-3 text-base leading-relaxed text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0"
        />
        <p id="field-about-hint" className="mt-1.5 text-sm text-ink-soft">
          Заказчики видят это вместе с вашими откликами. Контакты не указывайте.
        </p>
      </div>
      <SubmitButton pending="Сохраняем…">Сохранить профиль</SubmitButton>
    </form>
  );
}
