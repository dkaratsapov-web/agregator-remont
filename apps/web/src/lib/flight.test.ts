import { describe, expect, it } from 'vitest';
import {
  FLIGHT_KEYS,
  FLIGHT_SECONDS,
  FLIGHT_STOPS,
  FLIGHT_VIDEO_LOAD,
  flightGlideRate,
  flightLoadsAfterPageLoad,
  flightPoster,
  flightSeconds,
  flightSources,
  flightStopTarget,
} from './flight';

describe('flightSeconds', () => {
  it('начинается с первого кадра и заканчивается последним', () => {
    expect(flightSeconds(0)).toBe(0);
    expect(flightSeconds(1)).toBe(FLIGHT_SECONDS);
  });

  it('обрезает прогресс за пределами 0…1 (пружина прокрутки может выходить за край)', () => {
    expect(flightSeconds(-0.2)).toBe(0);
    expect(flightSeconds(1.3)).toBe(FLIGHT_SECONDS);
    expect(flightSeconds(Number.NaN)).toBe(0);
  });

  it('проходит через опорные точки и интерполирует между ними', () => {
    for (const [progress, seconds] of FLIGHT_KEYS) {
      expect(flightSeconds(progress)).toBeCloseTo(seconds);
    }
    expect(flightSeconds(0.225)).toBe(5);
    expect(flightSeconds(0.31)).toBeCloseTo(7.5);
  });

  it('не идёт назад при прокрутке вниз', () => {
    let prev = -1;
    for (let p = 0; p <= 1; p += 0.001) {
      const s = flightSeconds(p);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe('flightStopTarget', () => {
  it('доезжает до следующей остановки по ходу прокрутки', () => {
    expect(flightStopTarget(0.05, 1)).toBe(0.225);
    expect(flightStopTarget(0.3, 1)).toBe(0.39);
    expect(flightStopTarget(0.3, -1)).toBe(0.225);
    expect(flightStopTarget(0.9, 1)).toBe(1);
    expect(flightStopTarget(0.1, -1)).toBe(0);
  });

  it('не двигает прогресс, который уже на остановке, и без направления берёт ближайшую', () => {
    for (const stop of FLIGHT_STOPS) expect(flightStopTarget(stop + 0.001, 1)).toBe(stop);
    expect(flightStopTarget(0.3, 0)).toBe(0.225);
    expect(flightStopTarget(0.33, 0)).toBe(0.39);
  });

  it('остановки идут по возрастанию от 0 до 1', () => {
    expect(FLIGHT_STOPS[0]).toBe(0);
    expect(FLIGHT_STOPS[FLIGHT_STOPS.length - 1]).toBe(1);
    for (let i = 1; i < FLIGHT_STOPS.length; i++) {
      expect(FLIGHT_STOPS[i]!).toBeGreaterThan(FLIGHT_STOPS[i - 1]!);
    }
  });
});

describe('остановки и ключевые кадры', () => {
  it('каждая остановка стоит на целой секунде: там ключевой кадр роликов (-g 24)', () => {
    for (const stop of FLIGHT_STOPS) expect(Number.isInteger(flightSeconds(stop))).toBe(true);
  });
});

describe('flightGlideRate', () => {
  it('проигрывает шаг пролёта за 1,2–3 с и не медленнее обычной скорости', () => {
    for (const seconds of [0.5, 2.5, 5, 10]) {
      const rate = flightGlideRate(seconds);
      expect(rate).toBeGreaterThanOrEqual(1);
      expect(rate).toBeLessThanOrEqual(4);
      if (rate > 1) {
        expect(seconds / rate).toBeGreaterThanOrEqual(1.2);
        expect(seconds / rate).toBeLessThanOrEqual(3);
      }
    }
    expect(flightGlideRate(5)).toBeCloseTo(5 / 2.4);
  });
});

describe('flightSources', () => {
  it('сначала H.264, затем VP9, прямой и обратный ролик раздельно', () => {
    expect(flightSources('mobile', 'reverse')).toEqual([
      { src: '/landing/flight-v3/mobile-reverse.mp4', type: 'video/mp4; codecs="avc1.640028"' },
      { src: '/landing/flight-v3/mobile-reverse.webm', type: 'video/webm; codecs="vp9"' },
    ]);
    expect(flightPoster('desktop')).toBe('/landing/flight-v3/desktop-poster.avif');
  });
});

describe('flightLoadsAfterPageLoad', () => {
  it('after-load — всегда сразу, on-intent — никогда, on-intent-save-data — по saveData', () => {
    expect(flightLoadsAfterPageLoad('after-load', true)).toBe(true);
    expect(flightLoadsAfterPageLoad('on-intent', false)).toBe(false);
    expect(flightLoadsAfterPageLoad('on-intent-save-data', false)).toBe(true);
    expect(flightLoadsAfterPageLoad('on-intent-save-data', true)).toBe(false);
  });

  it('утверждённый вариант по умолчанию — сразу после загрузки страницы', () => {
    expect(FLIGHT_VIDEO_LOAD).toBe('after-load');
  });
});
