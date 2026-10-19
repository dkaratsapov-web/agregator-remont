'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Без мигания на быстрых переходах: полоса появляется, только если переход дольше этого. */
const SHOW_AFTER_MS = 150;

/**
 * Признак перехода между страницами приложения (AUDIT_FINDINGS UX-9): тонкая полоса сверху,
 * пока загружается следующая страница. Вместо loading.tsx: с ним Next.js начинает ответ до
 * notFound(), и чужой заказ отдавался бы с кодом 200 вместо 404.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);

  // Новый адрес отрисован: переход закончился.
  const url = `${pathname}?${searchParams.toString()}`;
  const [lastUrl, setLastUrl] = useState(url);
  if (url !== lastUrl) {
    setLastUrl(url);
    setPending(false);
    setVisible(false);
  }

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.download) return;
      const next = new URL(link.href, window.location.href);
      const here = window.location;
      if (next.origin !== here.origin) return;
      // Только якорь на той же странице — не переход.
      if (next.pathname === here.pathname && next.search === here.search) return;
      setPending(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  if (!visible) return null;
  return (
    <div
      role="progressbar"
      aria-label="Загружаем страницу"
      className="nav-progress fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden"
    />
  );
}
