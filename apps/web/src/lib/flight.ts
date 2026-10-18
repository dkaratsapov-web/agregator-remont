/**
 * Пролёт камеры по комнате на главной (docs/landing-video-brief.md).
 *
 * Видео 35 с (841 кадр, 24 кадр/с) нарезано на WebP в public/landing/flight-v1: широкие кадры для
 * горизонтального экрана и вертикальная обрезка для телефона. При замене роликов кадры кладутся
 * в новую папку (flight-v2), чтобы долгий кеш браузера не показал старые.
 */

export const FLIGHT_BASE = '/landing/flight-v1';

/** Длина пролёта, с. */
export const FLIGHT_SECONDS = 35;

export type FlightSet = { dir: 'desktop' | 'mobile'; count: number };

export const FLIGHT_SETS = {
  desktop: { dir: 'desktop', count: 180 },
  mobile: { dir: 'mobile', count: 120 },
} as const satisfies Record<string, FlightSet>;

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

/** Номер кадра набора для прогресса трека. */
export function flightFrame(progress: number, count: number): number {
  return Math.round((flightSeconds(progress) / FLIGHT_SECONDS) * (count - 1));
}

export function flightFrameUrl(set: FlightSet, index: number): string {
  return `${FLIGHT_BASE}/${set.dir}/${String(index).padStart(3, '0')}.webp`;
}

/**
 * Порядок загрузки: первый и последний кадр, затем всё более частая сетка (каждый 16-й, 8-й, …).
 * Пока догружаются остальные, прокрутка уже показывает ближайший загруженный кадр.
 */
export function flightLoadOrder(count: number): number[] {
  const order = count > 1 ? [0, count - 1] : [0];
  const seen = new Set(order);
  for (const step of [16, 8, 4, 2, 1]) {
    for (let i = 0; i < count; i += step) {
      if (!seen.has(i)) {
        seen.add(i);
        order.push(i);
      }
    }
  }
  return order;
}
