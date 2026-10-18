'use client';

import { type RefObject, useEffect } from 'react';
import { flightStopTarget } from '@/lib/flight';

/** Пауза после последнего события прокрутки, после которой считаем, что человек отпустил. */
const SETTLE_MS = 140;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Пролёт без остановок на полпути: когда человек перестал крутить внутри трека, страница сама
 * плавно доезжает до следующей остановки по ходу движения (FLIGHT_STOPS в lib/flight.ts), и
 * пролёт проигрывается до конца шага. Доезд уступает человеку: колесо, касание или клавиша его
 * прерывают. Пока палец на экране, доезд не начинается.
 */
export function useFlightSnap(track: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let anchor = window.scrollY;
    let timer = 0;
    let raf = 0;
    let touching = false;

    function bounds() {
      const el = track.current;
      if (!el) return null;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const length = el.offsetHeight - window.innerHeight;
      return length > 0 ? { top, length } : null;
    }

    function stopAuto() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function glide(to: number) {
      const from = window.scrollY;
      const box = bounds();
      if (!box) return;
      // 1,2–2,2 с в зависимости от расстояния: пролёт успевает проиграться, но без ожидания.
      const share = Math.abs(to - from) / box.length;
      const duration = Math.min(2200, Math.max(1200, share * 9000));
      const start = performance.now();
      anchor = to;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        window.scrollTo(0, from + (to - from) * easeInOut(t));
        raf = t < 1 ? requestAnimationFrame(step) : 0;
      };
      raf = requestAnimationFrame(step);
    }

    function settle() {
      timer = 0;
      if (raf || touching) return;
      const box = bounds();
      const y = window.scrollY;
      const direction = Math.abs(y - anchor) < 4 ? 0 : Math.sign(y - anchor);
      anchor = y;
      if (!box) return;
      const progress = (y - box.top) / box.length;
      // Только внутри трека: выше героя и ниже готовой комнаты страница прокручивается как обычно.
      if (progress <= 0.002 || progress >= 0.998) return;
      const target = box.top + flightStopTarget(progress, direction) * box.length;
      if (Math.abs(target - y) >= 2) glide(Math.round(target));
    }

    function onScroll() {
      if (raf) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, SETTLE_MS);
    }

    function interrupt() {
      if (!raf) return;
      stopAuto();
      anchor = window.scrollY;
    }

    const onTouchStart = () => {
      touching = true;
      interrupt();
    };
    const onTouchEnd = () => {
      touching = false;
      onScroll();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('keydown', interrupt);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.clearTimeout(timer);
      stopAuto();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', interrupt);
      window.removeEventListener('keydown', interrupt);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [track]);
}
