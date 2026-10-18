import { loadOAuthConfig } from './oauth.config';
import { displayName, normalizeEmail, normalizePhone } from './oauth.providers';

describe('loadOAuthConfig', () => {
  it('has no banks without client ids', () => {
    expect(loadOAuthConfig({})).toEqual({ redirectOrigin: undefined, providers: [] });
  });

  it('enables a bank with id, secret and the redirect origin (punycode for a Cyrillic domain)', () => {
    const config = loadOAuthConfig({
      TBANK_ID_CLIENT_ID: 'id',
      TBANK_ID_CLIENT_SECRET: 'secret',
      OAUTH_REDIRECT_ORIGIN: 'https://гарантыч.рф/',
    });
    expect(config.redirectOrigin).toBe('https://xn--80aah6bno9a5a.xn--p1ai');
    expect(config.providers).toMatchObject([
      { id: 'tbank', clientId: 'id', tokenUrl: 'https://id.tbank.ru/auth/token', scope: '' },
    ]);
  });

  it('refuses half-set or unsafe settings', () => {
    expect(() => loadOAuthConfig({ SBER_ID_CLIENT_ID: 'id' })).toThrow(/set together/);
    expect(() =>
      loadOAuthConfig({ TBANK_ID_CLIENT_ID: 'id', TBANK_ID_CLIENT_SECRET: 's' }),
    ).toThrow(/OAUTH_REDIRECT_ORIGIN is required/);
    expect(() =>
      loadOAuthConfig({
        NODE_ENV: 'production',
        SBER_ID_CLIENT_ID: 'id',
        SBER_ID_CLIENT_SECRET: 's',
        OAUTH_REDIRECT_ORIGIN: 'https://example.ru',
      }),
    ).toThrow(/SBER_ID_CERT_PATH is required/);
    expect(() =>
      loadOAuthConfig({
        NODE_ENV: 'production',
        TBANK_ID_CLIENT_ID: 'id',
        TBANK_ID_CLIENT_SECRET: 's',
        OAUTH_REDIRECT_ORIGIN: 'http://example.ru',
      }),
    ).toThrow(/https/);
  });
});

describe('bank profile normalisation', () => {
  it('normalises phone numbers in any Russian format', () => {
    expect(normalizePhone('75555555555')).toBe('+75555555555');
    expect(normalizePhone('+7 (903) 1111111')).toBe('+79031111111');
    expect(normalizePhone('89031112233')).toBe('+79031112233');
    expect(normalizePhone('+44 20 7946 0958')).toBeUndefined();
  });

  it('keeps only plausible emails and clean names', () => {
    expect(normalizeEmail(' Ivan@Example.RU ')).toBe('ivan@example.ru');
    expect(normalizeEmail('not-an-email')).toBeUndefined();
    expect(displayName(['Иван', ' Петров‮ '])).toBe('Иван Петров');
    expect(displayName(['', undefined])).toBeUndefined();
  });
});
