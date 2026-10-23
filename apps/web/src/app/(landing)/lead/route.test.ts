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
    ['plain text', valid, { type: 'text/plain' }, 415],
    ['oversized body', null, { raw: JSON.stringify({ ...valid, pad: 'x'.repeat(3000) }) }, 413],
  ] as const)('rejects %s', async (_name, body, init, status) => {
    const res = await post(body, init);
    expect(res.status).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized chunked body without Content-Length', async () => {
    state.headers.set('origin', 'http://localhost:3000');
    state.headers.set('host', 'localhost:3000');
    const big = new TextEncoder().encode(JSON.stringify({ ...valid, pad: 'x'.repeat(50_000) }));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(big);
        controller.close();
      },
    });
    const res = await POST(
      new Request('http://localhost:3000/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        duplex: 'half',
      } as RequestInit),
    );
    expect(res.status).toBe(413);
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

  // Форма без JS (аудит 23.10.2026): обычная отправка POST, ответ — переход на главную с кодом
  // результата. Имя и телефон не попадают в адрес.
  describe('HTML form without JS', () => {
    const form = (fields: Record<string, string>, origin?: string) =>
      post(null, {
        origin,
        type: 'application/x-www-form-urlencoded',
        raw: new URLSearchParams(fields).toString(),
      });
    const filled = { name: 'Ирина', phone: '8 912 345-67-89', consent: 'on' };

    it('forwards the lead and redirects to the result without personal data', async () => {
      fetchMock.mockResolvedValue(Response.json({ received: true }, { status: 201 }));
      const res = await form(filled);
      expect(res.status).toBe(303);
      const location = res.headers.get('location') ?? '';
      expect(location).toBe('/?lead=sent#apply');
      expect(location).not.toMatch(/912|Ирина|%D0/);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        name: 'Ирина',
        phone: '8 912 345-67-89',
        consent: true,
      });
    });

    it.each([
      ['no consent', { name: 'Ирина', phone: '8 912 345-67-89' }, 'consent'],
      ['empty body', {}, 'consent'],
    ] as const)('%s: back with a code, API not called', async (_name, fields, code) => {
      const res = await form(fields);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(`/?lead=${code}#apply`);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('closed while the privacy operator is not set', async () => {
      state.operator = null;
      const res = await form(filled);
      expect(res.headers.get('location')).toBe('/?lead=closed#apply');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      [400, 'invalid'],
      [429, 'limit'],
      [500, 'failed'],
    ] as const)('API %i: back with %s', async (status, code) => {
      fetchMock.mockResolvedValue(Response.json({ message: 'x' }, { status }));
      const res = await form(filled);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(`/?lead=${code}#apply`);
    });

    it('a foreign origin is still 403 without calling the API', async () => {
      const res = await form(filled, 'https://evil.example');
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
