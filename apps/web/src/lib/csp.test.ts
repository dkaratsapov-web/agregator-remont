import { describe, expect, it } from 'vitest';
import { buildCsp } from './csp';

const directive = (csp: string, name: string) =>
  csp
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.split(' ')
    .slice(1);

describe('buildCsp', () => {
  it('production policy has no unsafe-eval and locks down framing, objects and base', () => {
    const csp = buildCsp({ dev: false, nonce: 'abc123' });
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('ws:');
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(csp, 'base-uri')).toEqual(["'self'"]);
    expect(directive(csp, 'connect-src')).toEqual(["'self'"]);
    expect(directive(csp, 'report-uri')).toEqual(['/csp-report']);
  });

  it('scripts run only with the nonce of this response (AUD-02): no unsafe-inline', () => {
    const csp = buildCsp({ dev: false, nonce: 'abc123' });
    expect(directive(csp, 'script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(directive(csp, 'script-src')).not.toContain("'unsafe-inline'");
  });

  it('dev policy allows what Next.js HMR needs', () => {
    const csp = buildCsp({ dev: true, nonce: 'abc123' });
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(csp, 'connect-src')).toContain('ws:');
  });
});
