'use client';

import { type RefObject, useEffect } from 'react';
import { flightStopTarget } from '@/lib/flight';
import type { FlightGlide, FlightPlayer } from './flight-video';

/** Пауза после последнего события прокрутки, после которой считаем, что человек отпустил. */
const SETTLE_MS = 140;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Под видео — мягче: камера в ролике идёт с обычной скоростью, карточки не отстают от неё. */
const easeInOutSine = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;

/**
 * Пролёт без остановок на полпути: когда человек перестал крутить внутри трека, страница сама
 * плавно доезжает до следующей остановки по ходу движения (FLIGHT_STOPS в lib/flight.ts), и
 * пролёт проигрывается до конца шага. Если видео пролёта готово, доезд ведёт его воспроизведение
 * (flight-video.tsx), а прокрутка следует за временем видео; иначе доезд идёт по времени. Доезд
 * уступает человеку: колесо, касание или клавиша его прерывают. Пока палец на экране, доезд не
 * начинается.
 */
export function useFlightSnap(
  track: RefObject<HTMLElement | null>,
  player: RefObject<FlightPlayer | null>,
) {
  useEffect(() => {
    let anchor = window.scrollY;
    let timer = 0;
    let raf = 0;
    let touching = false;
    let video: FlightGlide | null = null;

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
      video?.cancel();
      video = null;
    }

    function glide(to: number) {
      let from = window.scrollY;
      const box = bounds();
      if (!box) return;
      video =
        player.current?.glide((from - box.top) / box.length, (to - box.top) / box.length) ?? null;
      // Без видео 1,2–2,2 с в зависимости от расстояния: пролёт успевает проиграться без ожидания.
      const timed = (distance: number) =>
        Math.min(2200, Math.max(1200, (Math.abs(distance) / box.length) * 9000));
      let duration = timed(to - from);
      let start = performance.now();
      anchor = to;
      const step = (now: number) => {
        if (video?.state() === 'failed') {
          // Видео не пошло: оставшийся путь — по времени, от текущего места.
          video = null;
          from = window.scrollY;
          start = now;
          duration = timed(to - from);
        }
        const t = video ? video.fraction() : Math.min(1, (now - start) / duration);
        const eased = video ? easeInOutSine(t) : easeInOut(t);
        // instant: у html scroll-behavior: smooth, и обычный scrollTo каждый кадр запускал бы
        // заново плавную прокрутку — страница стояла бы и догоняла рывком в конце.
        window.scrollTo({ top: from + (to - from) * eased, behavior: 'instant' });
        if (t < 1) raf = requestAnimationFrame(step);
        else {
          raf = 0;
          video = null;
        }
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
      player.current?.release();
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
  }, [track, player]);
}
