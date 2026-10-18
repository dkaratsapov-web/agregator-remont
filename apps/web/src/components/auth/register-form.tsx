'use client';

import { AUTH_LIMITS } from '@agregator/shared';
import { useActionState, useState } from 'react';
import { registerAction, type AuthFormState } from '@/app/(site)/(auth)/actions';
import type { BankId } from '@/lib/api';
import { BankButtons } from './bank-buttons';
import { Field } from './field';
import { FormError } from './form-error';
import { RoleFieldset } from './role-fieldset';
import { SubmitButton } from './submit-button';

export function RegisterForm({ banks = [], error }: { banks?: BankId[]; error?: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(registerAction, {});
  const role = state.values?.role ?? 'CUSTOMER';
  // Роль для кнопок банка: новый аккаунт через банк создаётся с выбранной здесь ролью.
  const [bankRole, setBankRole] = useState<string>(role);

  return (
    <form action={action} className="space-y-4 [@media(max-height:46rem)]:space-y-3">
      <FormError message={state.error ?? error} />
      <RoleFieldset defaultRole={role} onChange={setBankRole} />
      {/* Имя и email в одну строку на широком экране: форма помещается в первый экран. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Имя"
          name="name"
          autoComplete="name"
          required
          minLength={AUTH_LIMITS.NAME_MIN}
          maxLength={AUTH_LIMITS.NAME_MAX}
          defaultValue={state.values?.name}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={AUTH_LIMITS.EMAIL_MAX}
          defaultValue={state.values?.email}
        />
      </div>
      <Field
        label="Пароль"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={AUTH_LIMITS.PASSWORD_MIN}
        maxLength={AUTH_LIMITS.PASSWORD_MAX}
        hint={`Не короче ${AUTH_LIMITS.PASSWORD_MIN} символов, подойдёт фраза из нескольких слов.`}
      />
      <SubmitButton pending="Создаём аккаунт…">Зарегистрироваться</SubmitButton>
      <BankButtons
        links={banks.map((id) => ({ id, href: `/auth/${id}/start?role=${bankRole}` }))}
      />
    </form>
  );
}
