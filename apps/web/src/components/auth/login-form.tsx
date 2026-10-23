'use client';

import { useActionState, useRef } from 'react';
import { loginAction, type AuthFormState } from '@/app/(site)/(auth)/actions';
import type { BankId } from '@/lib/api';
import { BankButtons } from './bank-buttons';
import { Field } from './field';
import { FormError } from './form-error';
import { SubmitButton } from './submit-button';
import { useFocusInvalid } from './use-focus-invalid';

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
  const formRef = useRef<HTMLFormElement>(null);
  useFocusInvalid(formRef, state);
  return (
    <form ref={formRef} action={action} className="space-y-4 [@media(max-height:46rem)]:space-y-3">
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
        error={state.fields?.email}
      />
      <Field
        label="Пароль"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={128}
        error={state.fields?.password}
      />
      <SubmitButton pending="Входим…">Войти</SubmitButton>
      <details className="text-sm text-ink-soft">
        <summary className="cursor-pointer font-medium text-ink hover:text-accent">
          Забыли пароль?
        </summary>
        <p className="mt-1.5">
          Напишите в поддержку и назовите email аккаунта: администратор пришлёт ссылку для нового
          пароля. Ссылка действует сутки и один раз.
        </p>
      </details>
      <BankButtons
        links={banks.map((id) => ({
          id,
          href: `/auth/${id}/start${next ? `?next=${encodeURIComponent(next)}` : ''}`,
        }))}
      />
    </form>
  );
}
