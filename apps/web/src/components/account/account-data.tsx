'use client';

import { AUTH_LIMITS } from '@agregator/shared';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { deleteAccountAction, type SettingsState } from '@/app/(site)/account/settings/actions';
import { FormStatus } from './form-status';

const EXPORT_ERRORS: Record<string, string> = {
  limit: 'Слишком много выгрузок подряд. Подождите минуту и попробуйте снова.',
  failed: 'Не удалось подготовить файл. Попробуйте чуть позже.',
};

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 items-center justify-center rounded-xl border border-accent px-6 text-base font-semibold text-accent transition-[background-color,transform] duration-150 hover:bg-accent-tint active:scale-[0.97] disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? 'Удаляем…' : 'Удалить аккаунт'}
    </button>
  );
}

/**
 * «Свои данные»: скачать всё, что сервис хранит о человеке (JSON), и удалить аккаунт.
 * Обе части работают без JS: ссылка на файл и обычная форма Server Action.
 */
export function AccountData({ exportError }: { exportError?: string }) {
  const [state, action] = useActionState<SettingsState, FormData>(deleteAccountAction, {});
  const exportMessage = exportError ? EXPORT_ERRORS[exportError] : undefined;
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-ink">Скачать мои данные</h3>
        <p className="max-w-prose text-sm text-ink-soft">
          Один файл JSON: профиль, заказы, черновики, отклики, свои сообщения, отзывы, избранное,
          жалобы и устройства входа. Данных других людей в нём нет.
        </p>
        <FormStatus error={exportMessage} />
        <a
          href="/account/export"
          download
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-6 text-base font-semibold text-ink transition-colors duration-150 hover:bg-canvas"
        >
          Скачать файл
        </a>
      </div>

      <form action={action} className="space-y-4 border-t border-line pt-6">
        <h3 className="text-base font-semibold text-ink">Удалить аккаунт</h3>
        <ul className="max-w-prose list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>Имя, email, телефон, город, фото и профиль мастера стираются.</li>
          <li>Открытые заказы закрываются, отклики на рассмотрении отзываются.</li>
          <li>
            Завершённые заказы, отклики и переписка остаются у другой стороны без вашего имени: у
            неё есть право на историю своей сделки.
          </li>
          <li>Пока заказ в работе, удалить аккаунт нельзя: сначала завершите или закройте его.</li>
          <li>Восстановить аккаунт нельзя. С тем же email можно зарегистрироваться заново.</li>
        </ul>
        <FormStatus error={state.error} />
        <div className="max-w-sm">
          <label htmlFor="delete-password" className="block text-sm font-medium text-ink">
            Текущий пароль
          </label>
          <input
            id="delete-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={AUTH_LIMITS.PASSWORD_MAX}
            className="mt-1.5 block min-h-12 w-full rounded-[10px] border border-line bg-surface px-4 text-base text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
        <label className="flex max-w-prose cursor-pointer gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="confirm"
            required
            className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
          />
          <span>Понимаю, что удаление нельзя отменить</span>
        </label>
        <DeleteButton />
      </form>
    </div>
  );
}
