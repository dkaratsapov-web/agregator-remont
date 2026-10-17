'use client';

import { useEffect } from 'react';

/**
 * При переходе на главную из приложения (логотип, выход из аккаунта) Next.js оставляет прокрутку
 * прошлой страницы или прокручивает к случайному блоку длинного трека. Главная всегда
 * открывается сверху, а с якорем (#how-it-works) — на нужном блоке. Запускается после
 * собственной прокрутки Next.js (она идёт в эффекте родителя), поэтому через кадр.
 */
export function ScrollReset() {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = window.location.hash
        ? document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
        : null;
      if (target) target.scrollIntoView();
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
