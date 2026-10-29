import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { CSP_HEADER } from './lib/csp';
import { config, proxy } from './proxy';
import * as staticInfo from 'next/dist/build/analysis/get-page-static-info';
import { getMiddlewareRouteMatcher } from 'next/dist/shared/lib/router/utils/middleware-route-matcher';

// Функция, которой Next.js превращает config.matcher в правила; в описании типов Next её нет.
const { getMiddlewareMatchers } = staticInfo as unknown as {
  getMiddlewareMatchers: (
    matcher: typeof config.matcher,
    nextConfig: object,
  ) => Parameters<typeof getMiddlewareRouteMatcher>[0];
};

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

  // Как Next.js на самом деле применяет matcher: его же функции, а не самодельный RegExp
  // (ревью garantych-reviewer: тест должен ловить то, что видит сервер).
  const runs = (path: string, headers: Record<string, string> = {}) => {
    const matchers = getMiddlewareMatchers(config.matcher, {});
    const match = getMiddlewareRouteMatcher(matchers);
    return match(path, { headers } as never, {});
  };

  it('runs for pages and Server Action pages requested without a body', () => {
    expect(runs('/')).toBe(true);
    expect(runs('/jobs')).toBe(true);
    expect(runs('/account/jobs/cjob0000000000000000000001')).toBe(true);
    expect(runs('/offline')).toBe(true);
  });

  it('skips requests with a body: they get the fallback policy from next.config instead', () => {
    // Иначе Next.js копирует тело для proxy, обрезает его после 10 МБ и ждёт его целиком.
    expect(runs('/jobs', { 'content-length': '12' })).toBe(false);
    expect(runs('/lead', { 'transfer-encoding': 'chunked' })).toBe(false);
  });

  it('skips static files and prefetches', () => {
    expect(runs('/_next/static/chunks/main.js')).toBe(false);
    expect(runs('/landing/flight-v4/frame.webp')).toBe(false);
    expect(runs('/sw.js')).toBe(false);
    expect(runs('/jobs', { 'next-router-prefetch': '1' })).toBe(false);
  });
});
