'use client';

import { type MotionValue } from 'motion/react';
import { type RefObject, useEffect, useRef } from 'react';
import {
  FLIGHT_BASE,
  FLIGHT_SECONDS,
  flightGlideRate,
  flightPoster,
  flightSeconds,
  flightSources,
  type FlightLayout,
} from '@/lib/flight';

/** Доезд до остановки, который проигрывает видео (use-flight-snap.ts ведёт по нему прокрутку). */
export type FlightGlide = {
  /** Пройденная доля пути 0…1 по времени видео. */
  fraction(): number;
  /** failed — видео не пошло (запрет воспроизведения, обрыв загрузки): доезжать по времени. */
  state(): 'playing' | 'done' | 'failed';
  cancel(): void;
};

export type FlightPlayer = {
  /** Проиграть пролёт от одного прогресса трека к другому; null — видео не готово. */
  glide(from: number, to: number): FlightGlide | null;
  /** Человек сам крутит страницу: кадр снова следует за прокруткой. */
  release(): void;
};

/** Видео стоит дольше — считаем, что оно не идёт (сеть), и доезжаем без него. */
const STALL_MS = 1500;
/** Разница меньше половины кадра (24 кадр/с) не стоит перемотки. */
const SEEK_EPSILON = 1 / 48;
/** Дольше этого кадр после доезда на остановке не держится. */
const HOLD_MS = 1500;

/** Ролики, у которых уже был показан кадр. Во время перемотки readyState падает до метаданных. */
const loaded = new WeakSet<HTMLVideoElement>();
const ready = (video: HTMLVideoElement) =>
  loaded.has(video) && video.readyState >= HTMLMediaElement.HAVE_METADATA;

/**
 * Пролёт по комнате во весь экран. Видео не склеивается из кадров, а проигрывается браузером:
 * когда страница доезжает до следующего шага (use-flight-snap.ts), камера плывёт обычным
 * воспроизведением, вверх — по обратному ролику, и прокрутка следует за временем видео. При ручной
 * прокрутке кадр перематывается за прогрессом трека. Под видео лежит первый кадр картинкой: он
 * виден сразу, до загрузки роликов. Вертикальный экран получает вертикальную обрезку.
 */
export function FlightVideo({
  progress,
  player,
}: {
  progress: MotionValue<number>;
  player: RefObject<FlightPlayer | null>;
}) {
  const forwardRef = useRef<HTMLVideoElement>(null);
  const reverseRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const forward = forwardRef.current;
    const reverse = reverseRef.current;
    if (!forward || !reverse) return;

    const layout: FlightLayout = window.matchMedia('(orientation: portrait)').matches
      ? 'mobile'
      : 'desktop';
    let gliding = false;
    // После доезда кадр стоит на остановке, пока пружина прогресса не догонит прокрутку: иначе
    // он отъехал бы на пару кадров назад и вернулся.
    // Без колеса и касаний (полоса прокрутки) остановка отпускается сама через HOLD_MS.
    let hold: number | null = null;
    let holdUntil = 0;
    let shown: HTMLVideoElement | null = null;
    let pending: number | null = null;
    let raf = 0;
    let cancelled = false;

    function show(video: HTMLVideoElement) {
      if (!forward || !reverse) return;
      shown = video;
      forward.style.opacity = video === forward ? '1' : '0';
      reverse.style.opacity = video === reverse ? '1' : '0';
    }

    /** Перемотка без очереди: пока идёт одна, запоминается только последнее время. */
    function seek(video: HTMLVideoElement, time: number) {
      if (video.seeking) pending = time;
      else if (Math.abs(video.currentTime - time) >= SEEK_EPSILON) video.currentTime = time;
    }

    function onSeeked() {
      if (!forward) return;
      if (pending !== null && !gliding) {
        const time = pending;
        pending = null;
        seek(forward, time);
      }
      if (!gliding && shown !== forward && ready(forward)) show(forward);
    }

    function follow() {
      raf = 0;
      if (!forward || gliding || !ready(forward)) return;
      const value = progress.get();
      if (hold !== null) {
        if (Math.abs(value - hold) > 0.0008 && performance.now() < holdUntil) {
          schedule();
          return;
        }
        hold = null;
      }
      seek(forward, flightSeconds(value));
    }

    function schedule() {
      if (!raf) raf = requestAnimationFrame(follow);
    }

    /** Вернуть на экран прямой ролик (после обратного или сбоя), по умолчанию на текущем прогрессе. */
    function backToForward(time = flightSeconds(progress.get())) {
      gliding = false;
      if (!forward) return;
      seek(forward, time);
      // Если перемотка не нужна, seeked не придёт.
      if (!forward.seeking && ready(forward)) show(forward);
    }

    function glide(from: number, to: number): FlightGlide | null {
      if (!forward || !reverse) return null;
      const end0 = flightSeconds(to);
      // Доезд начинается с кадра на экране: при ручной прокрутке он может на долю секунды
      // отставать от прокрутки, и перемотка к точному месту дала бы скачок в начале доезда.
      const exact = flightSeconds(from);
      const onScreen = shown === forward && ready(forward) ? forward.currentTime : exact;
      const start0 = Math.sign(end0 - onScreen) === Math.sign(end0 - exact) ? onScreen : exact;
      const length = Math.abs(end0 - start0);
      // На паузе пролёта (камера стоит) видео не нужно: доезд по времени.
      if (length < SEEK_EPSILON) return null;
      const video = end0 > start0 ? forward : reverse;
      if (!ready(video)) return null;
      const start = video === forward ? start0 : FLIGHT_SECONDS - start0;
      const end = video === forward ? end0 : FLIGHT_SECONDS - end0;
      const rate = flightGlideRate(length);

      let status: 'playing' | 'done' | 'failed' = 'playing';
      let tick = 0;
      let lastTime = -1;
      let lastChange = performance.now();
      gliding = true;
      hold = null;
      pending = null;

      const stop = (next: 'done' | 'failed') => {
        status = next;
        cancelAnimationFrame(tick);
        video.removeEventListener('seeked', begin);
        video.pause();
      };

      const watch = (now: number) => {
        if (status !== 'playing') return;
        const time = video.currentTime;
        // Пауза чуть раньше и точная установка конца: кадр не проскакивает остановку
        // и не возвращается назад. Остановки — на ключевых кадрах, установка мгновенная.
        if (video.ended || time + rate / 60 >= end) {
          stop('done');
          video.currentTime = end;
          hold = to;
          holdUntil = performance.now() + HOLD_MS;
          if (video === reverse) backToForward(end0);
          else gliding = false;
          return;
        }
        if (time !== lastTime) {
          lastTime = time;
          lastChange = now;
        } else if (now - lastChange > STALL_MS) {
          stop('failed');
          backToForward();
          return;
        }
        tick = requestAnimationFrame(watch);
      };

      function begin() {
        if (status !== 'playing') return;
        show(video);
        video.playbackRate = rate;
        lastChange = performance.now();
        video.play().then(
          () => {
            if (status === 'playing') tick = requestAnimationFrame(watch);
          },
          () => {
            if (status !== 'playing') return;
            stop('failed');
            backToForward();
          },
        );
      }

      video.pause();
      if (Math.abs(video.currentTime - start) >= SEEK_EPSILON) {
        video.addEventListener('seeked', begin, { once: true });
        video.currentTime = start;
      } else begin();

      return {
        fraction: () =>
          status === 'done'
            ? 1
            : Math.min(1, Math.max(0, (video.currentTime - start) / (end - start))),
        state: () => status,
        cancel() {
          if (status !== 'playing') return;
          stop('done');
          backToForward();
        },
      };
    }

    player.current = {
      glide,
      release() {
        hold = null;
        schedule();
      },
    };

    // Ролик назад нужен только при прокрутке вверх: при экономии трафика и на медленной сети он
    // не грузится, и вверх кадр просто перематывается за прокруткой.
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    const light =
      connection?.saveData === true || /^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? '');

    function load(video: HTMLVideoElement, direction: 'forward' | 'reverse') {
      const source = flightSources(layout, direction).find((s) => video.canPlayType(s.type));
      if (!source) return;
      video.muted = true;
      video.preload = 'auto';
      video.src = source.src;
      video.load();
    }

    const onReverseData = () => {
      if (reverse) loaded.add(reverse);
    };
    const onForwardData = () => {
      if (!forward || cancelled) return;
      loaded.add(forward);
      seek(forward, flightSeconds(progress.get()));
      if (!forward.seeking) show(forward);
    };
    const onForwardReady = () => {
      if (!reverse || cancelled || light || reverse.src) return;
      load(reverse, 'reverse');
    };
    forward.addEventListener('loadeddata', onForwardData, { once: true });
    reverse.addEventListener('loadeddata', onReverseData, { once: true });
    forward.addEventListener('canplaythrough', onForwardReady, { once: true });
    forward.addEventListener('seeked', onSeeked);

    // Видео — после загрузки страницы: иначе на медленной сети оно задерживает событие load,
    // а первый кадр и так виден картинкой.
    // Reduced motion: при гидратации компонент успевает смонтироваться до переключения на
    // статичную версию — без этой проверки 15 МБ ролика грузились зря (ТЗ #40, п. 8).
    const start = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      load(forward, 'forward');
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });

    const unsubscribe = progress.on('change', schedule);
    return () => {
      cancelled = true;
      player.current = null;
      window.removeEventListener('load', start);
      forward.removeEventListener('loadeddata', onForwardData);
      reverse.removeEventListener('loadeddata', onReverseData);
      forward.removeEventListener('canplaythrough', onForwardReady);
      forward.removeEventListener('seeked', onSeeked);
      unsubscribe();
      cancelAnimationFrame(raf);
      // Снять адреса: иначе браузер докачивает ролики после ухода компонента.
      for (const video of [forward, reverse]) {
        video.pause();
        if (video.getAttribute('src')) {
          video.removeAttribute('src');
          video.load();
        }
      }
    };
  }, [progress, player]);

  const videoClass = 'absolute inset-0 size-full object-cover opacity-0';
  return (
    <div aria-hidden="true" className="absolute inset-0 bg-sunken">
      <picture>
        <source media="(orientation: portrait)" type="image/avif" srcSet={flightPoster('mobile')} />
        <source type="image/avif" srcSet={flightPoster('desktop')} />
        {/* Первый кадр пролёта как заставка: статичный файл из public, next/image не нужен.
            Браузер без AVIF покажет фото готовой комнаты. */}
        <img
          src={`${FLIGHT_BASE}/final.webp`}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
      <video
        ref={reverseRef}
        muted
        playsInline
        preload="none"
        disablePictureInPicture
        disableRemotePlayback
        tabIndex={-1}
        className={videoClass}
      />
      <video
        ref={forwardRef}
        muted
        playsInline
        preload="none"
        disablePictureInPicture
        disableRemotePlayback
        tabIndex={-1}
        className={videoClass}
      />
    </div>
  );
}
