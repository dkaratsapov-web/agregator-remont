'use client';

import type { SessionDto } from '@agregator/shared';
import { useActionState } from 'react';
import {
  revokeOthersAction,
  revokeSessionFormAction,
  type SettingsState,
} from '@/app/(site)/account/settings/actions';
import { FormStatus } from './form-status';
import { FormArgs } from '@/components/ui/form-args';

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
    <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-muted-tint text-ink-soft">
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
    revokeSessionFormAction,
    {},
  );
  // Подтверждение отдельным раскрытием, как у «Закрыть заказ» (AUDIT_FINDINGS UX-10).
  return (
    <details className="group flex flex-col items-end">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-[10px] border border-line bg-surface px-3.5 text-sm font-semibold text-ink transition-colors duration-150 hover:border-accent hover:text-accent group-open:border-ink [&::-webkit-details-marker]:hidden">
        Завершить
      </summary>
      <form action={action} className="mt-2 flex flex-col items-end gap-1.5 text-right">
        <FormArgs values={[id]} />
        <p className="max-w-[16rem] text-sm text-ink-soft">
          На этом устройстве придётся войти заново.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-10 items-center rounded-[10px] border border-accent px-3.5 text-sm font-semibold text-accent transition-colors duration-150 hover:bg-accent-tint disabled:opacity-60"
        >
          {pending ? 'Завершаем…' : 'Да, завершить сеанс'}
        </button>
        {state.error ? (
          <span role="alert" className="text-xs text-accent">
            {state.error}
          </span>
        ) : null}
      </form>
    </details>
  );
}

export function SessionsList({ sessions }: { sessions: SessionDto[] }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(revokeOthersAction, {});
  const others = sessions.filter((s) => !s.current).length;
  return (
    <div className="space-y-4">
      <FormStatus error={state.error} done={state.done} />
      <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-canvas">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
            <DeviceIcon device={s.device} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {s.device ?? 'Неизвестное устройство'}
                {s.current ? (
                  <span className="rounded-[6px] border border-ok/30 bg-ok-tint px-2 py-0.5 text-xs font-semibold text-ok">
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
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-[10px] bg-ink px-4 text-sm font-semibold text-canvas transition-[background-color,transform] duration-150 hover:bg-ink/85 active:scale-[0.97] [&::-webkit-details-marker]:hidden">
            Выйти на всех других устройствах
          </summary>
          <form action={action} className="mt-3 space-y-2">
            <p className="text-sm text-ink-soft">
              Другие устройства ({others}) выйдут из аккаунта. Это устройство останется.
            </p>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-[10px] border border-accent px-4 text-sm font-semibold text-accent transition-colors duration-150 hover:bg-accent-tint disabled:opacity-60"
            >
              {pending ? 'Завершаем…' : 'Да, выйти на других устройствах'}
            </button>
          </form>
        </details>
      ) : (
        <p className="text-sm text-ink-soft">Других активных входов нет.</p>
      )}
    </div>
  );
}
