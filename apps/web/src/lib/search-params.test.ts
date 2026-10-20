import { describe, expect, it } from 'vitest';
import {
  historyCursor,
  reportNotice,
  jobsHref,
  parseCategory,
  parseCity,
  parseOpenOnly,
  parsePage,
  parseQuery,
} from './search-params';

describe('parsePage', () => {
  it.each([
    [undefined, 1],
    ['3', 3],
    [['4', '5'], 4],
    ['0', 1],
    ['-2', 1],
    ['1.5', 1],
    ['abc', 1],
    ['10001', 1],
  ])('%j -> %i', (raw, expected) => {
    expect(parsePage(raw)).toBe(expected);
  });
});

describe('parseCategory', () => {
  it('accepts known categories only', () => {
    expect(parseCategory('PLUMBING')).toBe('PLUMBING');
    expect(parseCategory('plumbing')).toBeUndefined();
    expect(parseCategory(undefined)).toBeUndefined();
  });
});

describe('jobsHref', () => {
  it('omits defaults', () => {
    expect(jobsHref({})).toBe('/jobs');
    expect(jobsHref({ page: 1 })).toBe('/jobs');
    expect(jobsHref({ page: 2, category: 'TILING' })).toBe('/jobs?category=TILING&page=2');
  });

  it('keeps all filters', () => {
    expect(
      jobsHref({ q: 'плитка ванная', city: 'Тверь', category: 'TILING', openOnly: true, page: 3 }),
    ).toBe(
      '/jobs?q=%D0%BF%D0%BB%D0%B8%D1%82%D0%BA%D0%B0+%D0%B2%D0%B0%D0%BD%D0%BD%D0%B0%D1%8F&city=%D0%A2%D0%B2%D0%B5%D1%80%D1%8C&category=TILING&open=1&page=3',
    );
  });
});

describe('parseQuery and parseCity', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['   ', undefined],
    ['а', undefined],
    ['  плитка ', 'плитка'],
    [['ванна', 'кухня'], 'ванна'],
    ['а'.repeat(101), undefined],
  ])('query %j -> %j', (raw, expected) => {
    expect(parseQuery(raw)).toBe(expected);
  });

  it('trims city and drops invalid lengths', () => {
    expect(parseCity(' Тверь ')).toBe('Тверь');
    expect(parseCity('Т')).toBeUndefined();
    expect(parseCity('а'.repeat(101))).toBeUndefined();
  });
});

describe('parseOpenOnly', () => {
  it('is true only for 1', () => {
    expect(parseOpenOnly('1')).toBe(true);
    expect(parseOpenOnly('true')).toBe(false);
    expect(parseOpenOnly(undefined)).toBe(false);
  });
});

describe('historyCursor', () => {
  it('accepts a message id and ignores anything else', () => {
    expect(historyCursor('cmsg_01')).toBe('cmsg_01');
    expect(historyCursor(['a1', 'b2'])).toBe('a1');
    expect(historyCursor(undefined)).toBeUndefined();
    expect(historyCursor('a b')).toBeUndefined();
    expect(historyCursor('../x')).toBeUndefined();
  });
});

describe('reportNotice', () => {
  it('turns the outcome of a complaint without JS into a notice', () => {
    expect(reportNotice('sent')).toEqual({
      text: 'Жалоба отправлена. Администратор разберёт её.',
      ok: true,
    });
    expect(reportNotice('limit')?.ok).toBe(false);
    expect(reportNotice('weird')).toBeNull();
    expect(reportNotice(undefined)).toBeNull();
  });
});
