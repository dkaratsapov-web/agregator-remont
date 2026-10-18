'use client';

import { AUTH_LIMITS } from '@agregator/shared';
import { useActionState, useRef, useState } from 'react';
import { passwordAction, type SettingsState } from '@/app/(site)/account/settings/actions';
import { SubmitButton } from '@/components/auth/submit-button';
import { FormStatus } from './form-status';

function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  hint,
  minLength,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  hint?: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-1.5 flex min-h-12 items-center rounded-[10px] border border-line bg-surface focus-within:border-accent focus-within:outline-2 focus-within:outline-accent">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={AUTH_LIMITS.PASSWORD_MAX}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="w-0 min-w-0 flex-1 bg-transparent px-4 py-3 text-base text-ink focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          className="mr-1 inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-muted-tint hover:text-ink"
        >
          {visible ? 'Скрыть' : 'Показать'}
        </button>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<SettingsState, FormData>(async (prev, form) => {
    const result = await passwordAction(prev, form);
    if (result.done) ref.current?.reset();
    return result;
  }, {});
  return (
    <form ref={ref} action={action} className="space-y-5">
      <FormStatus error={state.error} done={state.done} />
      <PasswordInput
        id="current-password"
        name="currentPassword"
        label="Текущий пароль"
        autoComplete="current-password"
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <PasswordInput
          id="new-password"
          name="newPassword"
          label="Новый пароль"
          autoComplete="new-password"
          minLength={AUTH_LIMITS.PASSWORD_MIN}
          hint={`Не короче ${AUTH_LIMITS.PASSWORD_MIN} символов. Подойдёт фраза из нескольких слов.`}
        />
        <PasswordInput
          id="confirm-password"
          name="confirmPassword"
          label="Повторите новый пароль"
          autoComplete="new-password"
          minLength={AUTH_LIMITS.PASSWORD_MIN}
        />
      </div>
      <p className="text-sm text-ink-soft">
        После смены пароля вход на других устройствах завершится, на этом вы останетесь в аккаунте.
      </p>
      <div className="max-w-xs">
        <SubmitButton pending="Меняем пароль…">Сменить пароль</SubmitButton>
      </div>
    </form>
  );
}
