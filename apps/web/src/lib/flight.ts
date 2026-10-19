/**
 * Пролёт камеры по комнате на главной (docs/landing-video-brief.md).
 *
 * Видео 35 с (841 кадр, 24 кадр/с) лежит в public/landing/flight-v3 обычными роликами: широкий для
 * горизонтального экрана и вертикальная обрезка для телефона, у каждого прямой и обратный (для
 * прокрутки вверх). Браузер проигрывает их сам, поэтому движение камеры плавное, без склейки
 * кадров. Ключевой кадр каждую секунду: остановки (целые секунды) показываются точно, а перемотка
 * при ручной прокрутке быстрая. Нарезка: scripts/landing-flight-video.sh. При замене роликов
 * файлы кладутся в новую папку (flight-v4), чтобы долгий кеш браузера не показал старые.
 */

export const FLIGHT_BASE = '/landing/flight-v3';

/** Длина пролёта, с. */
export const FLIGHT_SECONDS = 35;

export type FlightLayout = 'desktop' | 'mobile';
export type FlightDirection = 'forward' | 'reverse';
export type FlightSource = { src: string; type: string };

/**
 * Ролики пролёта по порядку предпочтения: H.264 (аппаратное декодирование почти везде), затем VP9
 * для браузеров без H.264 (Chromium без проприетарных кодеков, часть Firefox на Linux).
 */
export function flightSources(layout: FlightLayout, direction: FlightDirection): FlightSource[] {
  const name = `${FLIGHT_BASE}/${layout}-${direction}`;
  return [
    { src: `${name}.mp4`, type: 'video/mp4; codecs="avc1.640028"' },
    { src: `${name}.webm`, type: 'video/webm; codecs="vp9"' },
  ];
}

/**
 * Когда грузить прямой ролик пролёта (ТЗ #42, п. 6; замеры — docs/PERFORMANCE_REPORT.md):
 * - after-load — сразу после загрузки страницы (утверждённый вариант, по умолчанию);
 * - on-intent — когда человек начал прокручивать или нажал клавишу: до этого виден постер
 *   (первый кадр), видео не качается;
 * - on-intent-save-data — on-intent только при «экономии трафика» в браузере, иначе after-load.
 * Меняется одной строкой ниже — решение владельца.
 */
export type FlightLoad = 'after-load' | 'on-intent' | 'on-intent-save-data';
export const FLIGHT_VIDEO_LOAD: FlightLoad = 'after-load';

/** Грузить ли ролик сразу после загрузки страницы (иначе — по первой прокрутке). */
export function flightLoadsAfterPageLoad(setting: FlightLoad, saveData: boolean): boolean {
  if (setting === 'on-intent') return false;
  if (setting === 'on-intent-save-data') return !saveData;
  return true;
}

/** Первый кадр пролёта картинкой: виден сразу, пока грузится видео. */
export function flightPoster(layout: FlightLayout): string {
  return `${FLIGHT_BASE}/${layout}-poster.avif`;
}

/**
 * Опорные точки «прогресс трека → секунда пролёта», между ними линейно. Ролики пролёта стыкуются
 * на 5, 10, … 30 с; на паузах (5 → 5) камера стоит, пока читается карточка шага.
 */
export const FLIGHT_KEYS: readonly (readonly [progress: number, seconds: number])[] = [
  [0, 0],
  [0.03, 0],
  [0.2, 5], // подоконник с рулеткой: «Опишите задачу»
  [0.25, 5],
  [0.37, 10], // три ящика с инструментом: «Получите отклики»
  [0.41, 10],
  [0.53, 15], // фокус на терракотовом ящике: «Выберите исполнителя»
  [0.6, 15],
  [0.71, 20], // демонтаж
  [0.82, 25], // черновые работы
  [0.94, 30], // чистовая отделка
  [1, FLIGHT_SECONDS],
];

/**
 * Остановки пролёта (прогресс трека): герой, четыре шага и этапы ремонта. Между ними страница не
 * останавливается: после прокрутки она сама плавно доезжает до следующей остановки по ходу
 * движения (components/landing/use-flight-snap.ts). Остановки — на паузах FLIGHT_KEYS, где
 * камера стоит и читается карточка шага.
 */
export const FLIGHT_STOPS: readonly number[] = [
  0, // первый экран
  0.225, // 01 Опишите задачу
  0.39, // 02 Получите отклики
  0.565, // 03 Выберите исполнителя
  0.71, // 04 демонтаж
  0.82, // черновые работы
  1, // чистовая отделка, готовая комната
];

/**
 * Куда доехать после прокрутки: ближайшая остановка по ходу движения (direction > 0 — вниз,
 * < 0 — вверх, 0 — ближайшая). Уже стоящий почти на остановке прогресс остаётся на ней.
 */
export function flightStopTarget(progress: number, direction: number): number {
  const near = FLIGHT_STOPS.find((stop) => Math.abs(stop - progress) < 0.004);
  if (near !== undefined) return near;
  if (direction > 0) return FLIGHT_STOPS.find((stop) => stop > progress) ?? 1;
  if (direction < 0) return [...FLIGHT_STOPS].reverse().find((stop) => stop < progress) ?? 0;
  return FLIGHT_STOPS.reduce((best, stop) =>
    Math.abs(stop - progress) < Math.abs(best - progress) ? stop : best,
  );
}

/** Секунда пролёта для прогресса трека (0…1, значения за пределами обрезаются). */
export function flightSeconds(progress: number): number {
  const first = FLIGHT_KEYS[0]!;
  const last = FLIGHT_KEYS[FLIGHT_KEYS.length - 1]!;
  if (!(progress > first[0])) return first[1];
  if (progress >= last[0]) return last[1];
  for (let i = 1; i < FLIGHT_KEYS.length; i++) {
    const [p1, s1] = FLIGHT_KEYS[i]!;
    if (progress <= p1) {
      const [p0, s0] = FLIGHT_KEYS[i - 1]!;
      return s0 + ((progress - p0) / (p1 - p0)) * (s1 - s0);
    }
  }
  return last[1];
}

/**
 * Скорость видео при доезде до остановки: отрезок пролёта (с) проигрывается за 1,2–3 с, чем
 * длиннее отрезок, тем быстрее, но не медленнее обычной скорости и не быстрее ×4.
 */
export function flightGlideRate(seconds: number): number {
  const duration = Math.min(3, Math.max(1.2, 0.9 + seconds * 0.3));
  return Math.min(4, Math.max(1, seconds / duration));
}
