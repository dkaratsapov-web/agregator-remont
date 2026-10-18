'use client';

import { useEffect } from 'react';

const MIN_VISIBLE_MS = 2200;

/**
 * Прелоадер: контур буквы «Г» из знака прорисовывается и заливается, терракотовый щит встаёт
 * на место, экран растворяется. Скрывается после document.fonts.ready, но не раньше 2,2 с от
 * начала загрузки, чтобы анимация успела показаться. Жёсткий предел 2,8 с задан в CSS (работает
 * и без JS), при reduced motion не показывается.
 */
export function Preloader() {
  useEffect(() => {
    const root = document.documentElement;
    const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
    let cancelled = false;
    const timer = new Promise((resolve) => setTimeout(resolve, wait));
    Promise.all([document.fonts?.ready, timer]).then(() => {
      if (!cancelled) root.classList.add('is-ready');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="preloader" aria-hidden="true">
      {/* Те же контуры, что у Mark в wordmark.tsx. */}
      <svg viewBox="-12 -12 468 480" width="76" height="78">
        <path
          className="preloader-g"
          pathLength={1}
          d="M10 80Q10 12 78 12H432L368 104Q362 110 352 110H122Q108 110 108 124V410L10 393Z"
        />
        <path
          className="preloader-shield"
          d="M188 258L362 184Q370 181 370 190V270Q370 340 300 390L188 446Z"
        />
      </svg>
      <span className="font-display text-sm font-semibold tracking-[0.18em] text-ink-soft uppercase">
        Гарантыч
      </span>
      <span className="preloader-bar" />
    </div>
  );
}
