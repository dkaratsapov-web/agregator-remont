import { describe, expect, it } from 'vitest';
import { isSameOriginRequest } from './same-origin';

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
