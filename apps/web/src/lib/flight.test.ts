import { describe, expect, it } from 'vitest';
import {
  FLIGHT_KEYS,
  FLIGHT_SECONDS,
  FLIGHT_SETS,
  flightFrame,
  flightFrameUrl,
  flightLoadOrder,
  flightSeconds,
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

describe('flightFrame', () => {
  it('переводит прогресс в номер кадра набора', () => {
    const { count } = FLIGHT_SETS.desktop;
    expect(flightFrame(0, count)).toBe(0);
    expect(flightFrame(1, count)).toBe(count - 1);
    expect(flightFrame(0.6, count)).toBe(Math.round((15 / 35) * (count - 1)));
  });
});

describe('flightFrameUrl', () => {
  it('дополняет номер до трёх цифр', () => {
    expect(flightFrameUrl(FLIGHT_SETS.mobile, 7)).toBe('/landing/flight-v1/mobile/007.webp');
  });
});

describe('flightLoadOrder', () => {
  it('содержит каждый кадр ровно один раз, первым идёт первый кадр', () => {
    for (const count of [1, 2, 17, 120, 180]) {
      const order = flightLoadOrder(count);
      expect(order[0]).toBe(0);
      expect([...order].sort((a, b) => a - b)).toEqual([...Array(count).keys()]);
    }
  });
});
