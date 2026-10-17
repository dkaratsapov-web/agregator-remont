'use client';

import { ACCOUNT_LIMITS, AUTH_LIMITS, LEAD_LIMITS, type UserDto } from '@agregator/shared';
import { useActionState } from 'react';
import { profileAction, type SettingsState } from '@/app/(site)/account/settings/actions';
import { Field } from '@/components/auth/field';
import { SubmitButton } from '@/components/auth/submit-button';
import { FormStatus } from './form-status';

/** +79001234567 → +7 900 123-45-67 */
const formatPhone = (phone: string | null) =>
  phone?.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 $1 $2-$3-$4') ?? '';

export function ProfileForm({ user }: { user: UserDto }) {
  const [state, action] = useActionState<SettingsState, FormData>(profileAction, {});
  const values = state.values ?? {
    name: user.name,
    phone: formatPhone(user.phone),
    city: user.city ?? '',
  };
  return (
    <form action={action} className="space-y-5">
      <FormStatus error={state.error} done={state.done} />
      <Field
        label="Имя"
        name="name"
        autoComplete="name"
        required
        minLength={AUTH_LIMITS.NAME_MIN}
        maxLength={AUTH_LIMITS.NAME_MAX}
        defaultValue={values.name}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Телефон"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7 900 123-45-67"
          maxLength={LEAD_LIMITS.PHONE_RAW_MAX}
          defaultValue={values.phone}
          hint="Виден только вам. Пригодится для связи по заказам."
        />
        <Field
          label="Город"
          name="city"
          autoComplete="address-level2"
          maxLength={ACCOUNT_LIMITS.CITY_MAX}
          defaultValue={values.city}
          hint="Подскажем заказы и мастеров рядом."
        />
      </div>
      <div className="max-w-xs">
        <SubmitButton pending="Сохраняем…">Сохранить</SubmitButton>
      </div>
    </form>
  );
}
