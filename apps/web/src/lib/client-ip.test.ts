import { describe, expect, it } from 'vitest';
import { clientIpFromForwardedFor, parseTrustProxyHops } from './client-ip';

describe('clientIpFromForwardedFor', () => {
  it('does not trust anything without configured proxies', () => {
    expect(clientIpFromForwardedFor('203.0.113.5', 0)).toBeUndefined();
  });

  it('takes the address appended by the trusted proxy, ignoring client-supplied entries', () => {
    expect(clientIpFromForwardedFor('203.0.113.5', 1)).toBe('203.0.113.5');
    expect(clientIpFromForwardedFor('6.6.6.6, 203.0.113.5', 1)).toBe('203.0.113.5');
    expect(clientIpFromForwardedFor('6.6.6.6, 203.0.113.5, 10.0.0.2', 2)).toBe('203.0.113.5');
    expect(clientIpFromForwardedFor('2001:db8::1', 1)).toBe('2001:db8::1');
  });

  it('returns undefined for missing, short or garbage headers', () => {
    expect(clientIpFromForwardedFor(null, 1)).toBeUndefined();
    expect(clientIpFromForwardedFor('203.0.113.5', 2)).toBeUndefined();
    expect(clientIpFromForwardedFor('<script>', 1)).toBeUndefined();
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
