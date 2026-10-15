import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  cookies: new Map<string, string>(),
  redirectedTo: undefined as string | undefined,
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => state.headers.get(name) ?? null }),
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name) ? { name, value: state.cookies.get(name) } : undefined,
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    state.redirectedTo = to;
    throw new Error('NEXT_REDIRECT');
  },
}));

const fetchMock = vi.fn();
const { placeBidAction, withdrawBidAction } = await import('./actions');
const { saveProfileAction } = await import('../profile/actions');
const { acceptBidAction } = await import('../jobs/actions');

const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields))
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  return fd;
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const bid = { price: '38 000', durationDays: '4', comment: 'Сделаю аккуратно и в срок.' };

beforeEach(() => {
  state.headers.clear();
  state.cookies.clear();
  state.redirectedTo = undefined;
  state.headers.set('origin', 'http://localhost:3000');
  state.headers.set('host', 'localhost:3000');
  state.cookies.set('ar_session', 'tok');
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

describe('placeBidAction', () => {
  it('sends only bid fields to the job endpoint and returns to the job page', async () => {
    fetchMock.mockResolvedValue(json(201, { id: 'b1' }));
    await expect(
      placeBidAction('job1', {}, form({ ...bid, status: 'ACCEPTED', contractorId: 'x' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/jobs/job1/bids');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ price: 38000, durationDays: 4, comment: bid.comment });
    expect(state.redirectedTo).toBe('/jobs/job1?bid=sent');
  });

  it('requires a session and a trusted origin', async () => {
    state.cookies.clear();
    await expect(placeBidAction('job1', {}, form(bid))).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/login?next=%2Fjobs%2Fjob1');
    state.cookies.set('ar_session', 'tok');
    state.headers.set('origin', 'https://evil.example');
    expect((await placeBidAction('job1', {}, form(bid))).error).toMatch(/Запрос отклонён/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows API conflicts and role errors', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { message: 'Вы уже откликнулись на этот заказ' }));
    expect((await placeBidAction('job1', {}, form(bid))).error).toBe(
      'Вы уже откликнулись на этот заказ',
    );
    fetchMock.mockResolvedValueOnce(json(403, { message: 'Недостаточно прав' }));
    expect((await placeBidAction('job1', {}, form(bid))).error).toMatch(/только подрядчики/);
  });

  it('refuses malformed job ids', async () => {
    expect((await placeBidAction('../x', {}, form(bid))).error).toMatch(/не найден/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('withdrawBidAction', () => {
  it('returns only to a same-site path', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'b1', status: 'WITHDRAWN' }));
    await expect(withdrawBidAction('b1', 'https://evil.example', {}, form({}))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(state.redirectedTo).toBe('/account?withdrawn=1');
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/v1/me/bids/b1/withdraw');
  });

  it('reports a foreign bid as not found', async () => {
    fetchMock.mockResolvedValue(json(404, { message: 'Отклик не найден' }));
    expect((await withdrawBidAction('b1', '/account/bids', {}, form({}))).error).toBe(
      'Отклик не найден.',
    );
  });
});

describe('acceptBidAction', () => {
  it('accepts via the owner endpoint and shows a notice', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'b1', status: 'ACCEPTED' }));
    await expect(acceptBidAction('job1', 'b1', {}, form({}))).rejects.toThrow('NEXT_REDIRECT');
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/v1/me/jobs/job1/bids/b1/accept');
    expect(state.redirectedTo).toBe('/account/jobs/job1?accepted=1');
  });

  it('rejects a cross-origin request before calling the API', async () => {
    state.headers.set('origin', 'https://evil.example');
    expect((await acceptBidAction('job1', 'b1', {}, form({}))).error).toMatch(/Запрос отклонён/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('saveProfileAction', () => {
  it('saves parsed profile data', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await expect(
      saveProfileAction(
        {},
        form({
          about: 'О себе',
          categories: ['TILING'],
          cities: 'Казань, Самара',
          experienceYears: '5',
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/me/profile');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({
      about: 'О себе',
      categories: ['TILING'],
      cities: ['Казань', 'Самара'],
      experienceYears: 5,
    });
  });
});
