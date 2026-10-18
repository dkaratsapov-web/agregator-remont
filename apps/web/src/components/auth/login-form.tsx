'use client';

import { useActionState } from 'react';
import { loginAction, type AuthFormState } from '@/app/(site)/(auth)/actions';
import type { BankId } from '@/lib/api';
import { BankButtons } from './bank-buttons';
import { Field } from './field';
import { FormError } from './form-error';
import { SubmitButton } from './submit-button';

export function LoginForm({
  next,
  banks = [],
  error,
}: {
  next?: string;
  banks?: BankId[];
  error?: string;
}) {
  const [state, action] = useActionState<AuthFormState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4 [@media(max-height:46rem)]:space-y-3">
      <FormError message={state.error ?? error} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={254}
        defaultValue={state.values?.email}
      />
      <Field
        label="Пароль"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={128}
      />
      <SubmitButton pending="Входим…">Войти</SubmitButton>
      <BankButtons
        links={banks.map((id) => ({
          id,
          href: `/auth/${id}/start${next ? `?next=${encodeURIComponent(next)}` : ''}`,
        }))}
      />
    </form>
  );
}
