import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  operator: null as null | { name: string; inn: string; ogrn: string; email: string },
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => state.headers.get(name) ?? null }),
}));

vi.mock('next/navigation', () => ({ redirect: () => undefined }));

// Реквизиты оператора включают приём заявок; в тесте переключаются без пересборки.
vi.mock('@agregator/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agregator/shared')>();
  return {
    ...actual,
    get PRIVACY_OPERATOR() {
      return state.operator;
    },
  };
});

const fetchMock = vi.fn();
const { POST } = await import('./route');

const OPERATOR = { name: 'ИП Тест', inn: '1', ogrn: '1', email: 'p@example.ru' };
const valid = { name: 'Ирина', phone: '8 912 345-67-89', consent: true };

function post(body: unknown, init: { origin?: string; type?: string; raw?: string } = {}) {
  state.headers.set('origin', init.origin ?? 'http://localhost:3000');
  state.headers.set('host', 'localhost:3000');
  const raw = init.raw ?? JSON.stringify(body);
  return POST(
    new Request('http://localhost:3000/lead', {
      method: 'POST',
      headers: { 'content-type': init.type ?? 'application/json' },
      body: raw,
    }),
  );
}

beforeEach(() => {
  state.headers.clear();
  state.operator = OPERATOR;
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_URL', 'http://api.test');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe('POST /lead', () => {
  it('forwards a valid lead to the API', async () => {
    fetchMock.mockResolvedValue(Response.json({ received: true }, { status: 201 }));
    const res = await post(valid);
    expect(res.status).toBe(201);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/leads');
    expect(JSON.parse(init.body)).toEqual({ ...valid, consent: true });
  });

  it('rejects a foreign origin without calling the API', async () => {
    const res = await post(valid, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is closed (503) while the privacy operator is not set', async () => {
    state.operator = null;
    const res = await post(valid);
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no consent', { ...valid, consent: false }, {}, 400],
    ['consent as a string', { ...valid, consent: 'on' }, {}, 400],
    ['not JSON', null, { raw: 'name=1' }, 400],
    ['form content type', valid, { type: 'application/x-www-form-urlencoded' }, 415],
    ['oversized body', null, { raw: JSON.stringify({ ...valid, pad: 'x'.repeat(3000) }) }, 413],
  ] as const)('rejects %s', async (_name, body, init, status) => {
    const res = await post(body, init);
    expect(res.status).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the API validation message through', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ message: 'Укажите российский номер телефона' }, { status: 400 }),
    );
    const res = await post(valid);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Укажите российский номер телефона');
  });

  it('hides API failures behind a generic message', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    const res = await post(valid);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/временно недоступен/);
  });
});
