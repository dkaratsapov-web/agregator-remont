'use client';

import { useEffect } from 'react';

const MIN_VISIBLE_MS = 2200;

/**
 * Прелоадер: контур комнаты прорисовывается и экран растворяется. Скрывается после
 * document.fonts.ready, но не раньше 2,2 с от начала загрузки, чтобы анимация успела показаться.
 * Жёсткий предел 2,8 с задан в CSS (работает и без JS), при reduced motion не показывается.
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
      <svg viewBox="0 0 120 110" width="128" height="117">
        <path
          className="draw"
          pathLength={1}
          style={{ '--i': 0 } as React.CSSProperties}
          d="M20 70 60 93 100 70 60 47Z"
        />
        <path
          className="draw"
          pathLength={1}
          style={{ '--i': 1 } as React.CSSProperties}
          d="M20 70V30L60 7v40"
        />
        <path
          className="draw"
          pathLength={1}
          style={{ '--i': 2 } as React.CSSProperties}
          d="M60 7l40 23v40"
        />
        <g className="preloader-block">
          <path d="M44 66 56 59 68 66 56 73Z" />
          <path d="M44 66v9l12 7v-9Z" fillOpacity="0.78" />
          <path d="M56 73v9l12-7v-9Z" fillOpacity="0.6" />
        </g>
      </svg>
      <span className="font-display text-sm font-semibold tracking-[0.18em] text-ink-soft uppercase">
        Гарантыч
      </span>
      <span className="preloader-bar" />
    </div>
  );
}
