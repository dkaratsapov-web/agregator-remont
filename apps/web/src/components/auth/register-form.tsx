'use client';

import { AUTH_LIMITS } from '@agregator/shared';
import { useActionState } from 'react';
import { registerAction, type AuthFormState } from '@/app/(site)/(auth)/actions';
import { Field } from './field';
import { FormError } from './form-error';
import { SubmitButton } from './submit-button';

const ROLE_OPTIONS = [
  { value: 'CUSTOMER', title: 'Я заказчик', text: 'Публикую заказы' },
  { value: 'CONTRACTOR', title: 'Я подрядчик', text: 'Откликаюсь на заказы' },
] as const;

export function RegisterForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(registerAction, {});
  const role = state.values?.role ?? 'CUSTOMER';

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <fieldset>
        <legend className="text-sm font-medium text-ink">Кто вы</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {ROLE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-2 rounded-xl border border-line bg-surface px-3 py-3 transition-colors sm:gap-3 sm:px-4 duration-150 has-[:checked]:border-accent has-[:checked]:bg-accent-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                defaultChecked={role === option.value}
                className="mt-1 size-4 accent-[var(--accent)]"
                required
              />
              <span>
                <span className="block text-[15px] font-semibold whitespace-nowrap sm:text-base">
                  {option.title}
                </span>
                <span className="mt-0.5 block text-sm text-ink-soft">{option.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
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
    </form>
  );
}
