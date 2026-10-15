import { describe, expect, it } from 'vitest';
import { jobsHref, parseCategory, parsePage } from './search-params';

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
});
