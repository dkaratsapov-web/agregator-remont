'use client';

import { type MotionValue } from 'motion/react';
import { useEffect, useRef } from 'react';
import {
  FLIGHT_BASE,
  FLIGHT_SETS,
  flightFrameUrl,
  flightLoadOrder,
  flightPosition,
  type FlightSet,
} from '@/lib/flight';

/** Сколько кадров грузится одновременно. */
const PARALLEL = 6;

/**
 * Пролёт по комнате во весь экран: кадр выбирается по прогрессу прокрутки и рисуется на canvas
 * с обрезкой по размеру экрана (как object-fit: cover). Кадров меньше, чем в исходном видео,
 * поэтому между соседними рисуется плавный переход по дробной позиции: картинка движется
 * непрерывно, без скачков от кадра к кадру. Под canvas лежит первый кадр обычной
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
    let drawnKey = '';
    let raf = 0;
    let cancelled = false;

    /** Ближайший загруженный кадр к index (пока догружаются остальные). */
    function nearestLoaded(index: number) {
      for (let d = 0; d < set.count; d++) {
        const img = frames[index - d] ?? frames[index + d];
        if (img) return img;
      }
      return undefined;
    }

    function cover(img: HTMLImageElement) {
      if (!canvas || !ctx) return;
      const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    }

    function draw() {
      raf = 0;
      if (!canvas || !ctx) return;
      const position = flightPosition(progress.get(), set.count);
      const index = Math.floor(position);
      const base = frames[index] ?? nearestLoaded(Math.round(position));
      if (!base) return;
      // Следующий кадр поверх с прозрачностью по дробной части; шаг 1/32 — глазу не видно, а
      // лишних перерисовок при мелкой прокрутке нет.
      const next = frames[index] ? frames[index + 1] : undefined;
      const mix = next ? Math.round((position - index) * 32) / 32 : 0;
      const key = `${base.src}|${mix > 0 ? next!.src : ''}|${mix}`;
      if (key === drawnKey) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = 1;
      cover(base);
      if (next && mix > 0) {
        ctx.globalAlpha = mix;
        cover(next);
        ctx.globalAlpha = 1;
      }
      drawnKey = key;
    }

    function schedule() {
      if (!raf) raf = requestAnimationFrame(draw);
    }

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      drawnKey = '';
      schedule();
    }

    // Экономия трафика — каждый 4-й кадр, медленная сеть (3G и хуже) — каждый 2-й: переход
    // между соседними кадрами сглаживает более крупный шаг.
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    const step = connection?.saveData
      ? 4
      : /^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? '')
        ? 2
        : 1;
    const queue = flightLoadOrder(set.count).filter((i) => i % step === 0);

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
    // Кадры — после загрузки страницы: иначе на медленной сети они задерживают событие load
    // (на телефоне при «медленном 4G» — до 24 с), а первый кадр и так виден картинкой-заставкой.
    const start = () => {
      for (let i = 0; i < PARALLEL; i++) loadNext();
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', start);
      observer.disconnect();
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, [progress]);

  return (
    <div aria-hidden="true" className="absolute inset-0 bg-sunken">
      <picture>
        <source
          media="(orientation: portrait)"
          type="image/avif"
          srcSet={flightFrameUrl(FLIGHT_SETS.mobile, 0)}
        />
        <source type="image/avif" srcSet={flightFrameUrl(FLIGHT_SETS.desktop, 0)} />
        {/* Первый кадр пролёта как заставка: статичный файл из public, next/image не нужен.
            Браузер без AVIF кадров пролёта не покажет и оставит фото готовой комнаты. */}
        <img
          src={`${FLIGHT_BASE}/final.webp`}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
