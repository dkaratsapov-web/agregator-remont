import { describe, expect, it } from 'vitest';
import { clientIpFromForwardedFor, normalizeIp, parseTrustProxyHops } from './client-ip';

describe('clientIpFromForwardedFor', () => {
  it('does not trust anything without configured proxies', () => {
    expect(clientIpFromForwardedFor('203.0.113.5', 0)).toBeUndefined();
  });

  it.each([
    ['203.0.113.5', 1, '203.0.113.5'],
    ['6.6.6.6, 203.0.113.5', 1, '203.0.113.5'],
    ['6.6.6.6,6.6.6.7,  203.0.113.5', 1, '203.0.113.5'],
    ['6.6.6.6, 203.0.113.5, 10.0.0.2', 2, '203.0.113.5'],
    ['2001:DB8::1', 1, '2001:db8::1'],
    ['::ffff:203.0.113.5', 1, '203.0.113.5'],
  ])('takes the proxy-appended address from %j (hops=%i)', (header, hops, expected) => {
    expect(clientIpFromForwardedFor(header, hops)).toBe(expected);
  });

  it.each([
    [null, 1],
    ['', 1],
    ['203.0.113.5', 2],
    ['999.999.999.999', 1],
    ['1.2.3', 1],
    ['::::::', 1],
    ['abc:def', 1],
    ['<script>', 1],
    ['203.0.113.5:443', 1],
  ])('returns undefined for %j (hops=%i)', (header, hops) => {
    expect(clientIpFromForwardedFor(header, hops)).toBeUndefined();
  });
});

describe('normalizeIp', () => {
  it('validates with node:net', () => {
    expect(normalizeIp('192.168.0.1')).toBe('192.168.0.1');
    expect(normalizeIp('256.1.1.1')).toBeUndefined();
    expect(normalizeIp('fe80::1')).toBe('fe80::1');
  });
});

describe('parseTrustProxyHops', () => {
  it('defaults to 0 and validates the range', () => {
    expect(parseTrustProxyHops(undefined)).toBe(0);
    expect(parseTrustProxyHops('1')).toBe(1);
    expect(() => parseTrustProxyHops('-1')).toThrow();
    expect(() => parseTrustProxyHops('true')).toThrow();
  });
});
