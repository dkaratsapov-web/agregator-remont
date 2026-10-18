'use client';

import { useActionState } from 'react';
import { completeBankAction, type AuthFormState } from '@/app/(site)/(auth)/actions';
import { FormError } from './form-error';
import { RoleFieldset } from './role-fieldset';
import { SubmitButton } from './submit-button';

/** Шаг после банка: аккаунта ещё нет, человек выбирает роль (заказчик или подрядчик). */
export function BankRoleForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(completeBankAction, {});
  const role = state.values?.role ?? 'CUSTOMER';
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <RoleFieldset defaultRole={role} />
      <SubmitButton pending="Создаём аккаунт…">Создать аккаунт</SubmitButton>
    </form>
  );
}
