import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  cookie: 'tok' as string | null,
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => state.headers.get(name) ?? null }),
  cookies: async () => ({
    get: () => (state.cookie ? { value: state.cookie } : undefined),
  }),
}));
vi.mock('next/navigation', () => ({ redirect: () => undefined }));

const fetchMock = vi.fn();
const { POST, GET, DELETE } = await import('./route');

/** Сколько байт тела прочитано обработчиком: лимит должен остановить чтение рано. */
let pulled = 0;

function multipart(size: number): { body: ReadableStream<Uint8Array>; type: string } {
  pulled = 0;
  const boundary = 'xBOUNDARYx';
  const head = new TextEncoder().encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const chunk = new Uint8Array(64 * 1024).fill(7);
  let sent = 0;
  let stage = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (stage === 0) {
        controller.enqueue(head);
        stage = 1;
      } else if (stage === 1 && sent < size) {
        const n = Math.min(chunk.byteLength, size - sent);
        controller.enqueue(chunk.subarray(0, n));
        sent += n;
        pulled += n;
      } else if (stage === 1) {
        controller.enqueue(tail);
        stage = 2;
      } else controller.close();
    },
  });
  return { body, type: `multipart/form-data; boundary=${boundary}` };
}

const post = (size: number) => {
  const { body, type } = multipart(size);
  // Без Content-Length: тело приходит потоком, как chunked-запрос.
  return POST(
    new Request('http://localhost:3000/account/avatar', {
      method: 'POST',
      headers: { 'content-type': type },
      body,
      duplex: 'half',
    } as RequestInit),
  );
};

beforeEach(() => {
  state.headers.clear();
  state.headers.set('origin', 'http://localhost:3000');
  state.headers.set('host', 'localhost:3000');
  state.cookie = 'tok';
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

describe('POST /account/avatar', () => {
  it('rejects a chunked body over the limit with 413 without calling the API', async () => {
    const res = await post(50 * 1024 * 1024);
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
    // Чтение прервано сразу за лимитом (5 МБ + запас), а не после всех 50 МБ.
    expect(pulled).toBeLessThan(6 * 1024 * 1024);
  });

  it('forwards a small photo to the API', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ avatarVersion: '2026-10-18T00:00:00.000Z' }, { status: 200 }),
    );
    const res = await post(10 * 1024);
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/me/avatar');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('rejects a foreign origin and a missing session', async () => {
    state.headers.set('origin', 'https://evil.example');
    expect((await post(10)).status).toBe(403);
    state.headers.set('origin', 'http://localhost:3000');
    state.cookie = null;
    expect((await post(10)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /account/avatar', () => {
  it('serves the photo without a long-lived cache', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
    expect(res.headers.get('content-type')).toBe('image/webp');
  });
});

describe('DELETE /account/avatar', () => {
  it('deletes through the API with the session token', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'u1', avatarVersion: null }));
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ avatarVersion: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/me/avatar');
    expect(init.method).toBe('DELETE');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok');
  });

  it('rejects a foreign origin and a missing session without calling the API', async () => {
    state.headers.set('origin', 'https://evil.example');
    expect((await DELETE()).status).toBe(403);
    state.headers.set('origin', 'http://localhost:3000');
    state.cookie = null;
    expect((await DELETE()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
