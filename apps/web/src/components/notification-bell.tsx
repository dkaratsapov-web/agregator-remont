'use client';

import { useEffect, useState } from 'react';

/** Как часто значок спрашивает число непрочитанных, пока вкладка на экране. */
const POLL_MS = 60_000;

/** «99+» вместо больших чисел: значок остаётся маленьким. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/**
 * Колокольчик в шапке кабинета: ведёт к уведомлениям, показывает число непрочитанных.
 * Число приходит со страницей и обновляется раз в минуту, пока вкладка на экране, и сразу при
 * возврате на вкладку. null — сводка недоступна: значок без числа.
 */
export function NotificationBell({
  initial,
  app = false,
}: {
  initial: number | null;
  app?: boolean;
}) {
  const [count, setCount] = useState(initial);
  // Новое число со страницы (переход, router.refresh после прочтения) важнее опрошенного.
  const [fromPage, setFromPage] = useState(initial);
  if (initial !== fromPage) {
    setFromPage(initial);
    setCount(initial);
  }

  useEffect(() => {
    let stopped = false;
    async function poll() {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/account/notifications/summary', { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { unread: unknown };
        if (!stopped && typeof body.unread === 'number') setCount(body.unread);
      } catch {
        /* сеть: попробуем в следующий раз */
      }
    }
    const timer = window.setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, []);

  const unread = count ?? 0;
  return (
    <a
      href="/account/notifications"
      aria-label={unread > 0 ? `Уведомления: непрочитанных ${unread}` : 'Уведомления'}
      title="Уведомления"
      className={`relative grid place-items-center text-ink-soft transition-colors duration-150 hover:bg-ink/5 hover:text-ink ${
        app ? 'size-11 rounded-[12px] border border-line bg-surface/70' : 'size-11 rounded-full'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-[22px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14l1.5-2Z" />
        <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
      </svg>
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold leading-5 tabular-nums text-accent-ink ring-2 ring-canvas"
        >
          {badgeText(unread)}
        </span>
      ) : null}
    </a>
  );
}
