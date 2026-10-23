import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/csp-report/route';
import { blockedSource, createReportLog, pagePath, parseCspReports } from './csp-report';

describe('CSP reports', () => {
  it('reads report-uri bodies and keeps no personal data', () => {
    expect(
      parseCspReports({
        'csp-report': {
          'document-uri': 'https://remont.example/reset/AbCdEfGhIjKlMnOpQrStUv?email=a@b.ru#x',
          'violated-directive': 'img-src',
          'effective-directive': 'img-src',
          'blocked-uri': 'https://tracker.example/pixel.png?uid=42',
          disposition: 'report',
        },
      }),
    ).toEqual([
      {
        directive: 'img-src',
        blocked: 'https://tracker.example',
        page: '/reset/:id',
        disposition: 'report',
      },
    ]);
  });

  it('reads Reporting API batches and ignores other report types', () => {
    const violations = parseCspReports([
      { type: 'deprecation', body: {} },
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://remont.example/jobs/12345',
          effectiveDirective: 'script-src-elem',
          blockedURL: 'inline',
          disposition: 'enforce',
        },
      },
    ]);
    expect(violations).toEqual([
      {
        directive: 'script-src-elem',
        blocked: 'inline',
        page: '/jobs/:id',
        disposition: 'enforce',
      },
    ]);
    expect(parseCspReports(Array.from({ length: 50 }, () => violations[0]))).toHaveLength(0);
    expect(
      parseCspReports(
        Array.from({ length: 50 }, () => ({ type: 'csp-violation', body: { blockedURL: 'eval' } })),
      ),
    ).toHaveLength(20);
  });

  it('normalises sources, paths and odd input', () => {
    expect(blockedSource('data')).toBe('data');
    expect(blockedSource('blob:https://remont.example/1')).toBe('blob');
    expect(blockedSource('javascript:alert(1)')).toBe('javascript');
    expect(blockedSource('<script>')).toBe('other');
    expect(blockedSource('')).toBe('unknown');
    expect(pagePath('not a url')).toBe('unknown');
    expect(pagePath('https://remont.example/')).toBe('/');
    expect(parseCspReports({ 'csp-report': { 'violated-directive': 'IMG;DROP' } })).toEqual([
      { directive: 'unknown', blocked: 'unknown', page: 'unknown', disposition: 'report' },
    ]);
    expect(parseCspReports(null)).toEqual([]);
    expect(parseCspReports('text')).toEqual([]);
  });

  it('writes at most the limit per minute and reports how many were dropped', () => {
    const lines: string[] = [];
    let t = 0;
    const log = createReportLog(
      (line) => lines.push(line),
      2,
      () => t,
    );
    const v = { directive: 'img-src', blocked: 'data', page: '/', disposition: 'report' };
    log([v, v, v, v]);
    expect(lines).toHaveLength(2);
    t = 60_000;
    log([v]);
    expect(lines.slice(2).map((l) => JSON.parse(l).event)).toEqual([
      'csp-violation-dropped',
      'csp-violation',
    ]);
    expect(JSON.parse(lines[2]).count).toBe(2);
  });

  it('route: 204 for a report, 415, 413 and 400 for bad requests', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const post = (body: string, type = 'application/csp-report') =>
      POST(
        new Request('http://localhost/csp-report', {
          method: 'POST',
          headers: { 'content-type': type },
          body,
        }),
      );
    const report = JSON.stringify({
      'csp-report': {
        'document-uri': 'http://localhost/jobs',
        'effective-directive': 'img-src',
        'blocked-uri': 'https://x.example/a.png',
      },
    });
    expect((await post(report)).status).toBe(204);
    expect(JSON.parse(warn.mock.calls.at(-1)![0] as string)).toMatchObject({
      event: 'csp-violation',
      directive: 'img-src',
      blocked: 'https://x.example',
      page: '/jobs',
    });
    expect((await post(report, 'text/plain')).status).toBe(415);
    expect((await post('x'.repeat(9_000))).status).toBe(413);
    expect((await post('{broken')).status).toBe(400);
    warn.mockRestore();
  });
});
