import type { NotificationDto } from '@agregator/shared';
import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import { describeNotification } from '@/lib/notifications';

/**
 * Ведомость уведомлений: непрочитанные — с терракотовой меткой и жирным заголовком. Строка —
 * обычная ссылка (открывается и в новой вкладке); уведомления заказа становятся прочитанными,
 * когда открыта его страница.
 */
export function NotificationList({ items }: { items: NotificationDto[] }) {
  return (
    <ul aria-label="Уведомления" className="divide-y divide-line">
      {items.map((n) => {
        const view = describeNotification(n);
        return (
          <li key={n.id}>
            <Link
              href={view.href}
              className={`group relative flex gap-3.5 px-5 py-3.5 transition-colors duration-150 hover:bg-canvas sm:px-6 ${
                n.read ? '' : 'bg-accent-tint/40'
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-2 size-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-accent'}`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <span className={`text-ink ${n.read ? 'font-medium' : 'font-semibold'}`}>
                    {n.read ? null : <span className="sr-only">Новое: </span>}
                    {view.title}
                  </span>
                  <time
                    dateTime={n.createdAt}
                    className="shrink-0 text-xs tabular-nums text-ink-soft"
                  >
                    {formatDateTime(n.createdAt)}
                  </time>
                </span>
                {view.detail ? (
                  <span className="mt-0.5 block text-sm text-ink [overflow-wrap:anywhere]">
                    {view.detail}
                  </span>
                ) : null}
                <span className="mt-0.5 block truncate text-sm text-ink-soft">{n.jobTitle}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
