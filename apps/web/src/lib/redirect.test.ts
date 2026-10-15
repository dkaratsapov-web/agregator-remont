import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_LOGIN, safeRedirectPath } from './redirect';

describe('safeRedirectPath', () => {
  it.each([
    ['/account', '/account'],
    ['/jobs?page=2#top', '/jobs?page=2#top'],
    ['/jobs/../account', '/account'],
  ])('keeps same-site path %s', (raw, expected) => {
    expect(safeRedirectPath(raw)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '/\t/evil.example',
    '/\n/evil.example',
    `/${'a'.repeat(600)}`,
  ])('falls back for %j', (raw) => {
    expect(safeRedirectPath(raw)).toBe(DEFAULT_AFTER_LOGIN);
  });
});
