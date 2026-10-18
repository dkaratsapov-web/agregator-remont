'use client';

import {
  ACCOUNT_LIMITS,
  AUTH_LIMITS,
  LEAD_LIMITS,
  SERVICE_AREA_ERROR,
  type UserDto,
} from '@agregator/shared';
import { useActionState } from 'react';
import { profileAction, type SettingsState } from '@/app/(site)/account/settings/actions';
import { Field } from '@/components/auth/field';
import { SubmitButton } from '@/components/auth/submit-button';
import { CityCombobox } from '@/components/ui/city-combobox';
import { CITY_GROUPS, CITY_OPTIONS } from '@/lib/city-options';
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
        <div>
          <label htmlFor="profile-city" className="block text-sm font-medium text-ink">
            Город
          </label>
          <div className="mt-1.5">
            <CityCombobox
              id="profile-city"
              name="city"
              options={CITY_OPTIONS}
              groups={CITY_GROUPS}
              defaultValue={values.city}
              placeholder="Начните вводить"
              strict
              emptyMessage={SERVICE_AREA_ERROR}
              maxLength={ACCOUNT_LIMITS.CITY_MAX}
              aria-describedby="profile-city-hint"
            />
          </div>
          <p id="profile-city-hint" className="mt-1.5 text-sm text-ink-soft">
            Подскажем заказы и мастеров рядом.
          </p>
        </div>
      </div>
      <div className="max-w-xs">
        <SubmitButton pending="Сохраняем…">Сохранить</SubmitButton>
      </div>
    </form>
  );
}
