'use client';

import { useActionState, useId, useState } from 'react';
import type { ResetLinkState } from '@/app/(site)/admin/users/actions';
import { formatDateTime } from '@/lib/format';
import { FormArgs } from '@/components/ui/form-args';
import type { FormArg } from '@/lib/form-args';

/**
 * Выдать ссылку для нового пароля. Ссылка показывается один раз: её копируют и передают человеку
 * (мессенджер, звонок). Работает и без JS: форма — Server Action, ссылка в поле для выделения.
 */
export function ResetLinkForm({
  args,
  action,
}: {
  action: (prev: ResetLinkState, form: FormData) => Promise<ResetLinkState>;
  /** Параметры действия скрытым полем вместо bind (lib/form-args.ts). */
  args?: readonly FormArg[];
}) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {});
  const [copied, setCopied] = useState(false);
  return (
    <details className="group open:basis-full">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-[10px] border border-line px-3.5 text-sm font-semibold text-ink transition-colors hover:border-ink/30 [&::-webkit-details-marker]:hidden">
        Ссылка для нового пароля
      </summary>
      <form
        action={formAction}
        className="mt-2 space-y-2.5 rounded-[12px] border border-line bg-canvas p-3.5"
      >
        {args ? <FormArgs values={args} /> : null}
        <p className="text-sm text-ink-soft">
          Ссылка действует сутки и один раз. Новая ссылка отменяет прежнюю. Передайте её только
          владельцу аккаунта: по ней задают новый пароль без старого.
        </p>
        {state.link ? (
          <div className="space-y-2">
            <label htmlFor={`${id}-link`} className="block text-sm font-medium text-ink">
              Ссылка (до {state.expiresAt ? formatDateTime(state.expiresAt) : 'завтра'})
            </label>
            <input
              id={`${id}-link`}
              readOnly
              value={state.link}
              onFocus={(event) => event.currentTarget.select()}
              className="block w-full rounded-[10px] border border-line bg-surface px-3 py-2 font-mono text-sm text-ink"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(state.link ?? '').then(() => setCopied(true));
              }}
              className="inline-flex min-h-10 items-center rounded-[10px] bg-ink px-4 text-sm font-semibold text-canvas hover:bg-ink/85"
            >
              {copied ? 'Скопировано' : 'Скопировать'}
            </button>
          </div>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-sm text-accent">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-10 items-center rounded-[10px] border border-line px-4 text-sm font-semibold text-ink transition-colors hover:border-ink/30 disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? 'Создаём…' : state.link ? 'Создать другую ссылку' : 'Создать ссылку'}
        </button>
      </form>
    </details>
  );
}
