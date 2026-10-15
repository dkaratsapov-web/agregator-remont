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
    const csp = buildCsp({ dev: false });
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('ws:');
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(csp, 'base-uri')).toEqual(["'self'"]);
    expect(directive(csp, 'connect-src')).toEqual(["'self'"]);
  });

  it('dev policy allows what Next.js HMR needs', () => {
    const csp = buildCsp({ dev: true });
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(csp, 'connect-src')).toContain('ws:');
  });
});
