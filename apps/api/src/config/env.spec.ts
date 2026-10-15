import { loadEnv } from './env';

describe('loadEnv', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

  it('applies defaults', () => {
    expect(loadEnv(base)).toEqual({ port: 4000, corsOrigins: [], databaseUrl: base.DATABASE_URL });
  });

  it('parses CORS origins list', () => {
    const env = loadEnv({ ...base, CORS_ORIGINS: 'http://a.test, http://b.test,' });
    expect(env.corsOrigins).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rejects missing DATABASE_URL, bad port and wildcard CORS', () => {
    expect(() => loadEnv({})).toThrow('DATABASE_URL');
    expect(() => loadEnv({ ...base, API_PORT: 'abc' })).toThrow('API_PORT');
    expect(() => loadEnv({ ...base, CORS_ORIGINS: '*' })).toThrow('CORS_ORIGINS');
  });
});
