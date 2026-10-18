import { describe, expect, it } from 'vitest';
import {
  FLIGHT_KEYS,
  FLIGHT_SECONDS,
  FLIGHT_SETS,
  FLIGHT_STOPS,
  flightFrame,
  flightPosition,
  flightStopTarget,
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

describe('flightPosition', () => {
  it('даёт дробную позицию между кадрами, согласованную с flightFrame', () => {
    const { count } = FLIGHT_SETS.desktop;
    expect(flightPosition(0, count)).toBe(0);
    expect(flightPosition(1, count)).toBe(count - 1);
    const position = flightPosition(0.65, count);
    expect(Number.isInteger(position)).toBe(false);
    expect(flightFrame(0.65, count)).toBe(Math.round(position));
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

describe('flightFrameUrl', () => {
  it('дополняет номер до трёх цифр', () => {
    expect(flightFrameUrl(FLIGHT_SETS.mobile, 7)).toBe('/landing/flight-v2/mobile/007.avif');
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
