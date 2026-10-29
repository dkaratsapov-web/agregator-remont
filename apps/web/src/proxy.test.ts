import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { CSP_HEADER } from './lib/csp';
import { config, proxy } from './proxy';

/** Nonce для CSP (docs/SECURITY.md, переход CSP; независимый аудит, AUD-02). */
describe('proxy: CSP nonce', () => {
  const nonceOf = (csp: string | null) => /'nonce-([A-Za-z0-9+/=_-]+)'/.exec(csp ?? '')?.[1];

  it('gives every page its own nonce and passes it to Next.js in the request', () => {
    const first = proxy(new NextRequest('http://localhost:3000/jobs'));
    const second = proxy(new NextRequest('http://localhost:3000/jobs'));
    const csp = first.headers.get(CSP_HEADER);
    const nonce = nonceOf(csp);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(nonceOf(second.headers.get(CSP_HEADER))).not.toBe(nonce);
    // Next.js берёт nonce из заголовка запроса и ставит его своим скриптам.
    expect(first.headers.get(`x-middleware-request-${CSP_HEADER.toLowerCase()}`)).toBe(csp);
    const scriptSrc = csp?.split('; ').find((d) => d.startsWith('script-src ')) ?? '';
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('keeps the other request headers (session cookie, client address)', () => {
    const res = proxy(
      new NextRequest('http://localhost:3000/account', {
        headers: { cookie: 'ar_session=tok', 'x-forwarded-for': '10.0.0.1' },
      }),
    );
    expect(res.headers.get('x-middleware-request-cookie')).toBe('ar_session=tok');
    expect(res.headers.get('x-middleware-request-x-forwarded-for')).toBe('10.0.0.1');
  });

  it('skips static files and prefetches', () => {
    const [rule] = config.matcher;
    const re = new RegExp(`^${rule.source}$`);
    expect(re.test('/jobs')).toBe(true);
    expect(re.test('/')).toBe(true);
    expect(re.test('/_next/static/chunks/main.js')).toBe(false);
    expect(re.test('/landing/flight-v4/frame.webp')).toBe(false);
    expect(re.test('/sw.js')).toBe(false);
    expect(rule.missing).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'next-router-prefetch' })]),
    );
  });
});
