import { describe, expect, it } from 'vitest';
import { isSameOriginRequest, parsePublicOrigin } from './same-origin';

const req = (headers: Record<string, string>) => (name: string) => headers[name] ?? null;

describe('isSameOriginRequest', () => {
  it('accepts a same-origin browser request', () => {
    expect(
      isSameOriginRequest(
        req({
          origin: 'https://remont.example',
          host: 'remont.example',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toBe(true);
  });

  it('uses X-Forwarded-Host behind a proxy', () => {
    expect(
      isSameOriginRequest(
        req({
          origin: 'https://remont.example',
          host: 'web:3000',
          'x-forwarded-host': 'remont.example',
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ['missing Origin', { host: 'remont.example' }],
    ['Origin: null', { origin: 'null', host: 'remont.example' }],
    ['foreign Origin', { origin: 'https://evil.example', host: 'remont.example' }],
    ['lookalike Origin', { origin: 'https://remont.example.evil.example', host: 'remont.example' }],
    ['different port', { origin: 'https://remont.example:8443', host: 'remont.example' }],
    [
      'cross-site fetch',
      { origin: 'https://remont.example', host: 'remont.example', 'sec-fetch-site': 'cross-site' },
    ],
    [
      'same-site but not same-origin',
      { origin: 'https://remont.example', host: 'remont.example', 'sec-fetch-site': 'same-site' },
    ],
    ['garbage Origin', { origin: 'not a url', host: 'remont.example' }],
    ['no Host', { origin: 'https://remont.example' }],
  ])('rejects %s', (_name, headers) => {
    expect(isSameOriginRequest(req(headers))).toBe(false);
  });
});

describe('isSameOriginRequest with WEB_PUBLIC_ORIGIN', () => {
  const PUBLIC = 'https://remont.example';

  it('accepts only the configured public origin', () => {
    expect(isSameOriginRequest(req({ origin: PUBLIC, host: 'web:3000' }), PUBLIC)).toBe(true);
  });

  it('ignores spoofed Host and X-Forwarded-Host that match a foreign Origin', () => {
    expect(
      isSameOriginRequest(
        req({
          origin: 'https://evil.example',
          host: 'evil.example',
          'x-forwarded-host': 'evil.example',
        }),
        PUBLIC,
      ),
    ).toBe(false);
  });

  it('rejects http when the public origin is https', () => {
    expect(isSameOriginRequest(req({ origin: 'http://remont.example' }), PUBLIC)).toBe(false);
  });
});

describe('parsePublicOrigin', () => {
  it('normalizes and validates', () => {
    expect(parsePublicOrigin(undefined)).toBeUndefined();
    expect(parsePublicOrigin('https://remont.example/')).toBe('https://remont.example');
    expect(() => parsePublicOrigin('https://remont.example/app')).toThrow();
    expect(() => parsePublicOrigin('ftp://remont.example')).toThrow();
    expect(() => parsePublicOrigin('remont.example')).toThrow();
  });
});
