'use client';

import { type MotionValue } from 'motion/react';
import { useEffect, useRef } from 'react';
import {
  FLIGHT_SETS,
  flightFrame,
  flightFrameUrl,
  flightLoadOrder,
  type FlightSet,
} from '@/lib/flight';

/** Сколько кадров грузится одновременно. */
const PARALLEL = 6;

/**
 * Пролёт по комнате во весь экран: кадр выбирается по прогрессу прокрутки и рисуется на canvas
 * с обрезкой по размеру экрана (как object-fit: cover). Под canvas лежит первый кадр обычной
 * картинкой: он виден сразу, ещё до загрузки скрипта и остальных кадров.
 * Вертикальный экран получает вертикальную обрезку кадров (набор выбирается один раз при загрузке).
 */
export function FlightCanvas({ progress }: { progress: MotionValue<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const set: FlightSet = window.matchMedia('(orientation: portrait)').matches
      ? FLIGHT_SETS.mobile
      : FLIGHT_SETS.desktop;
    const frames: (HTMLImageElement | undefined)[] = new Array(set.count);
    let drawn: HTMLImageElement | undefined;
    let raf = 0;
    let cancelled = false;

    function nearestLoaded(index: number) {
      for (let d = 0; d < set.count; d++) {
        const img = frames[index - d] ?? frames[index + d];
        if (img) return img;
      }
      return undefined;
    }

    function draw() {
      raf = 0;
      const img = nearestLoaded(flightFrame(progress.get(), set.count));
      if (!canvas || !ctx || !img || img === drawn) return;
      const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      drawn = img;
    }

    function schedule() {
      if (!raf) raf = requestAnimationFrame(draw);
    }

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      drawn = undefined;
      schedule();
    }

    // Режим экономии трафика: только каждый 4-й кадр, пролёт идёт крупнее шагом.
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
      true;
    const queue = flightLoadOrder(set.count).filter((i) => !saveData || i % 4 === 0);

    function loadNext() {
      const index = queue.shift();
      if (index === undefined || cancelled) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = flightFrameUrl(set, index);
      img
        .decode()
        .then(() => {
          if (cancelled) return;
          frames[index] = img;
          schedule();
        })
        .catch(() => {
          // Кадр не загрузился: его заменит ближайший загруженный.
        })
        .finally(loadNext);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const unsubscribe = progress.on('change', schedule);
    for (let i = 0; i < PARALLEL; i++) loadNext();

    return () => {
      cancelled = true;
      observer.disconnect();
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, [progress]);

  return (
    <div aria-hidden="true" className="absolute inset-0 bg-sunken">
      <picture>
        <source media="(orientation: portrait)" srcSet={flightFrameUrl(FLIGHT_SETS.mobile, 0)} />
        {/* Первый кадр пролёта как заставка: статичный файл из public, next/image не нужен. */}
        <img
          src={flightFrameUrl(FLIGHT_SETS.desktop, 0)}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
