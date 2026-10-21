'use client';

import { AUTH_LIMITS } from '@agregator/shared';
import { useActionState, useRef } from 'react';
import { resetPasswordAction, type AuthFormState } from '@/app/(site)/(auth)/actions';
import { Field } from './field';
import { FormError } from './form-error';
import { SubmitButton } from './submit-button';
import { useFocusInvalid } from './use-focus-invalid';

export function ResetPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(resetPasswordAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusInvalid(formRef, state);
  return (
    <form ref={formRef} action={action} className="space-y-4">
      <FormError message={state.error} />
      <Field
        label="Новый пароль"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={AUTH_LIMITS.PASSWORD_MIN}
        maxLength={AUTH_LIMITS.PASSWORD_MAX}
        hint={`Не короче ${AUTH_LIMITS.PASSWORD_MIN} символов.`}
        error={state.fields?.password}
      />
      <Field
        label="Пароль ещё раз"
        name="repeat"
        type="password"
        autoComplete="new-password"
        required
        maxLength={AUTH_LIMITS.PASSWORD_MAX}
        error={state.fields?.repeat}
      />
      <SubmitButton pending="Сохраняем…">Сохранить и войти</SubmitButton>
    </form>
  );
}
