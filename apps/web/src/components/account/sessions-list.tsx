'use client';

import type { SessionDto } from '@agregator/shared';
import { useActionState } from 'react';
import {
  revokeOthersAction,
  revokeSessionAction,
  type SettingsState,
} from '@/app/(site)/account/settings/actions';
import { FormStatus } from './form-status';

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

function DeviceIcon({ device }: { device: string | null }) {
  const phone = device ? /iOS|Android/.test(device) : false;
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted-tint text-ink-soft">
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden="true"
      >
        {phone ? (
          <>
            <rect x="7" y="3" width="10" height="18" rx="2.5" />
            <path d="M11 17.5h2" strokeLinecap="round" />
          </>
        ) : (
          <>
            <rect x="3" y="4.5" width="18" height="12" rx="2" />
            <path d="M8.5 20h7M12 16.5V20" strokeLinecap="round" />
          </>
        )}
      </svg>
    </span>
  );
}

function RevokeButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    revokeSessionAction.bind(null, id),
    {},
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 items-center rounded-xl border border-line bg-surface px-3.5 text-sm font-semibold text-ink transition-colors duration-150 hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {pending ? 'Завершаем…' : 'Завершить'}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-accent">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function SessionsList({ sessions }: { sessions: SessionDto[] }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(revokeOthersAction, {});
  const others = sessions.filter((s) => !s.current).length;
  return (
    <div className="space-y-4">
      <FormStatus error={state.error} done={state.done} />
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
            <DeviceIcon device={s.device} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {s.device ?? 'Неизвестное устройство'}
                {s.current ? (
                  <span className="rounded-full bg-ok-tint px-2 py-0.5 text-xs font-semibold text-ok">
                    Это устройство
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-sm text-ink-soft">
                Вход {dateFormat.format(new Date(s.createdAt))}
                {s.lastSeenAt && !s.current
                  ? ` · активность ${dateFormat.format(new Date(s.lastSeenAt))}`
                  : ''}
              </p>
            </div>
            {s.current ? null : <RevokeButton id={s.id} />}
          </li>
        ))}
      </ul>
      {others > 0 ? (
        <form action={action}>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-canvas transition-[background-color,transform] duration-150 hover:bg-ink/85 active:scale-[0.97] disabled:opacity-60"
          >
            {pending ? 'Завершаем…' : 'Выйти на всех других устройствах'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-ink-soft">Других активных входов нет.</p>
      )}
    </div>
  );
}
