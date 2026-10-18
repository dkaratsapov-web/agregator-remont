import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import {
  checkGateCredentials,
  GATE_TTL_SECONDS,
  gateConfig,
  isGateLocked,
  isPageNavigation,
  isValidGatePass,
  issueGatePass,
  recordGateFailure,
  resetGateFailures,
} from './gate';

const HASH = bcrypt.hashSync('ci-password', 4);
const config = { user: 'tester', hash: HASH };
const NOW = Date.UTC(2026, 9, 18);

describe('gateConfig', () => {
  it('reads the tester login and bcrypt hash', () => {
    expect(gateConfig({ BASIC_AUTH_USER: 'tester', BASIC_AUTH_HASH: HASH })).toEqual(config);
  });

  it('is off without a login or with a malformed hash', () => {
    expect(gateConfig({ BASIC_AUTH_HASH: HASH })).toBeNull();
    expect(gateConfig({ BASIC_AUTH_USER: 'tester' })).toBeNull();
    expect(gateConfig({ BASIC_AUTH_USER: 'tester', BASIC_AUTH_HASH: 'plain' })).toBeNull();
  });
});

describe('gate pass', () => {
  it('accepts a fresh pass until it expires', () => {
    const pass = issueGatePass(config, NOW);
    expect(isValidGatePass(config, pass, NOW)).toBe(true);
    expect(isValidGatePass(config, pass, NOW + (GATE_TTL_SECONDS - 1) * 1000)).toBe(true);
    expect(isValidGatePass(config, pass, NOW + GATE_TTL_SECONDS * 1000)).toBe(false);
  });

  it('rejects a pass after the tester password changes', () => {
    const pass = issueGatePass(config, NOW);
    const changed = { ...config, hash: bcrypt.hashSync('new-password', 4) };
    expect(isValidGatePass(changed, pass, NOW)).toBe(false);
  });

  it('rejects forged, edited and empty passes', () => {
    const pass = issueGatePass(config, NOW);
    const [version, , sig] = pass.split('.');
    expect(isValidGatePass(config, `${version}.9999999999.${sig}`, NOW)).toBe(false);
    expect(isValidGatePass(config, 'v1.9999999999.forged', NOW)).toBe(false);
    expect(isValidGatePass(config, `v2.${pass.slice(3)}`, NOW)).toBe(false);
    expect(isValidGatePass(config, '', NOW)).toBe(false);
    expect(isValidGatePass(config, undefined, NOW)).toBe(false);
    expect(isValidGatePass(null, pass, NOW)).toBe(false);
  });
});

describe('checkGateCredentials', () => {
  it('needs both the login and the password', async () => {
    expect(await checkGateCredentials(config, 'tester', 'ci-password')).toBe(true);
    expect(await checkGateCredentials(config, 'tester', 'wrong')).toBe(false);
    expect(await checkGateCredentials(config, 'admin', 'ci-password')).toBe(false);
    expect(await checkGateCredentials(config, 'tester', '')).toBe(false);
    expect(await checkGateCredentials(config, 'tester', 'x'.repeat(300))).toBe(false);
  });
});

describe('failed attempts limit', () => {
  it('locks an IP after 10 failures for 15 minutes', () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < 9; i += 1) recordGateFailure(ip, NOW);
    expect(isGateLocked(ip, NOW)).toBe(false);
    recordGateFailure(ip, NOW);
    expect(isGateLocked(ip, NOW)).toBe(true);
    expect(isGateLocked('203.0.113.8', NOW)).toBe(false);
    expect(isGateLocked(ip, NOW + 15 * 60 * 1000)).toBe(false);
    resetGateFailures(ip);
  });
});

describe('isPageNavigation', () => {
  const nav = (headers: Record<string, string>) => isPageNavigation(new Headers(headers));

  it('redirects only page opens in the browser', () => {
    expect(nav({ 'sec-fetch-mode': 'navigate', accept: 'text/html' })).toBe(true);
    expect(nav({ accept: 'text/html,application/xhtml+xml' })).toBe(true);
    expect(nav({ 'sec-fetch-mode': 'cors', accept: 'text/html' })).toBe(false);
    expect(nav({ accept: '*/*' })).toBe(false);
    expect(nav({ 'sec-fetch-mode': 'navigate', rsc: '1' })).toBe(false);
    expect(nav({ 'sec-fetch-mode': 'navigate', 'x-forwarded-method': 'POST' })).toBe(false);
  });
});
