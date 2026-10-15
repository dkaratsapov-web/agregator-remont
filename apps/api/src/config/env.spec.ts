import { loadEnv } from './env';

describe('loadEnv', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

  it('applies safe defaults: no CORS origins, proxy headers not trusted', () => {
    expect(loadEnv(base)).toEqual({
      port: 4000,
      corsOrigins: [],
      trustProxy: false,
      databaseUrl: base.DATABASE_URL,
    });
  });

  it('rejects missing DATABASE_URL and bad port', () => {
    expect(() => loadEnv({})).toThrow('DATABASE_URL');
    expect(() => loadEnv({ ...base, API_PORT: 'abc' })).toThrow('API_PORT');
  });

  describe('CORS_ORIGINS', () => {
    it('parses a list of exact origins', () => {
      const env = loadEnv({
        ...base,
        CORS_ORIGINS: 'http://localhost:3000, https://remont.example,',
      });
      expect(env.corsOrigins).toEqual(['http://localhost:3000', 'https://remont.example']);
    });

    it.each([
      ['*', '"*" is not allowed'],
      ['remont.example', 'not a valid origin'],
      ['https://remont.example/', 'bare origin'],
      ['https://remont.example/app', 'bare origin'],
      ['ftp://remont.example', 'must use https'],
    ])('rejects %s', (value, message) => {
      expect(() => loadEnv({ ...base, CORS_ORIGINS: value })).toThrow(message);
    });

    it('requires https in production but allows an empty list', () => {
      const prod = { ...base, NODE_ENV: 'production' };
      expect(() => loadEnv({ ...prod, CORS_ORIGINS: 'http://remont.example' })).toThrow(
        'https in production',
      );
      expect(loadEnv({ ...prod, CORS_ORIGINS: 'https://remont.example' }).corsOrigins).toEqual([
        'https://remont.example',
      ]);
      expect(loadEnv(prod).corsOrigins).toEqual([]);
    });
  });

  describe('TRUST_PROXY', () => {
    it.each([
      [undefined, false],
      ['', false],
      ['false', false],
      ['1', 1],
      ['loopback, 10.0.0.0/8', ['loopback', '10.0.0.0/8']],
    ])('%j -> %j', (value, expected) => {
      expect(loadEnv({ ...base, TRUST_PROXY: value }).trustProxy).toEqual(expected);
    });

    it.each([
      ['true', 'trusts any client'],
      ['0', '1..10'],
      ['11', '1..10'],
    ])('rejects %s', (value, message) => {
      expect(() => loadEnv({ ...base, TRUST_PROXY: value })).toThrow(message);
    });
  });
});
