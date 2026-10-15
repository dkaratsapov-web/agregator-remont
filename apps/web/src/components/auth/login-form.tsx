'use client';

import { useActionState } from 'react';
import { loginAction, type AuthFormState } from '@/app/(auth)/actions';
import { Field } from './field';
import { FormError } from './form-error';
import { SubmitButton } from './submit-button';

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-5" noValidate={false}>
      <FormError message={state.error} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
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
    </form>
  );
}
