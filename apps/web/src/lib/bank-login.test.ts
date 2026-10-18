import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  bankErrorCode,
  bankErrorMessage,
  describePending,
  isBankId,
  newBankFlow,
  stateMatches,
} from './bank-login';

describe('newBankFlow', () => {
  it('makes fresh state, nonce and an S256 PKCE pair within the API limits', () => {
    const a = newBankFlow('sber', 'login', '/account', 'CONTRACTOR');
    const b = newBankFlow('sber', 'login', '/account');
    expect(a.flow.state).not.toBe(b.flow.state);
    expect(a.flow.state).toMatch(/^[A-Za-z0-9_-]{16,96}$/);
    expect(a.flow.nonce).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(a.flow.verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(a.codeChallenge).toBe(createHash('sha256').update(a.flow.verifier).digest('base64url'));
    expect(a.flow.role).toBe('CONTRACTOR');
    expect(b.flow.role).toBeUndefined();
  });

  it('drops a role that is not self-service (ADMIN)', () => {
    expect(newBankFlow('tbank', 'login', '/', 'ADMIN').flow.role).toBeUndefined();
  });
});

describe('stateMatches', () => {
  it('accepts only the same state', () => {
    expect(stateMatches('abc', 'abc')).toBe(true);
    expect(stateMatches('abc', 'abd')).toBe(false);
    expect(stateMatches('abc', 'ab')).toBe(false);
    expect(stateMatches('abc', null)).toBe(false);
  });
});

describe('describePending', () => {
  it('reads the bank and name for display and rejects garbage', () => {
    const body = Buffer.from(
      JSON.stringify({ provider: 'tbank', profile: { subject: 's', name: 'Анна' }, exp: 1 }),
    ).toString('base64url');
    expect(describePending(`${body}.sig`)).toEqual({ bank: 'tbank', name: 'Анна' });
    expect(describePending('not-base64-json')).toBeNull();
    const vk = Buffer.from(JSON.stringify({ provider: 'vk' })).toString('base64url');
    expect(describePending(`${vk}.sig`)).toBeNull();
  });
});

describe('bank errors', () => {
  it('maps API codes to page codes and messages', () => {
    expect(bankErrorCode('OAUTH_EMAIL_TAKEN')).toBe('email-taken');
    expect(bankErrorCode(undefined, 429)).toBe('rate-limited');
    expect(bankErrorCode('OAUTH_FAILED')).toBe('failed');
    expect(bankErrorMessage('email-taken', 'sber')).toContain('привяжите Сбер ID');
    expect(bankErrorMessage('cancelled', 'tbank')).toBe('Вход через Т-Банк ID отменён.');
    expect(bankErrorMessage(undefined)).toBeUndefined();
    expect(bankErrorMessage('<script>')).toMatch(/^Не удалось войти/);
  });

  it('knows only the two banks', () => {
    expect(isBankId('sber')).toBe(true);
    expect(isBankId('tbank')).toBe(true);
    expect(isBankId('vk')).toBe(false);
  });
});
