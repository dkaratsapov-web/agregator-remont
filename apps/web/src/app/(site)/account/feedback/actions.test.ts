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
const { sendFeedbackAction } = await import('./actions');
const { replyFeedbackFormAction } = await import('../../admin/feedback/actions');
const { FOREIGN_ORIGIN } = await import('@/lib/action-guard');
const { encodeFormArgs } = await import('@/lib/form-args');

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const filled = {
  kind: 'BUG',
  body: 'Кнопка не нажимается на телефоне.',
  page: '/account/jobs/new',
};

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

describe('sendFeedbackAction', () => {
  it('sends kind, text and page, then goes to «my requests» with a «sent» mark', async () => {
    fetchMock.mockResolvedValue(json(201, { id: 'f1' }));
    await expect(sendFeedbackAction({}, form(filled))).rejects.toThrow('NEXT_REDIRECT');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/me/feedback');
    expect(JSON.parse(init.body)).toEqual(filled);
    expect(state.redirectedTo).toBe('/account/feedback?sent=1');
  });

  it.each([
    ['a full address', 'https://evil.example/x'],
    ['a protocol-relative address', '//evil.example'],
    ['a path with spaces', '/a b'],
  ])('drops the page when it is %s', async (_name, page) => {
    fetchMock.mockResolvedValue(json(201, { id: 'f1' }));
    await expect(sendFeedbackAction({}, form({ ...filled, page }))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).page).toBeUndefined();
  });

  it('checks the kind and the length before calling the API; keeps the text', async () => {
    expect(await sendFeedbackAction({}, form({ ...filled, kind: 'RANT' }))).toMatchObject({
      error: expect.stringContaining('ошибка, идея или вопрос'),
      values: { body: filled.body },
    });
    expect(await sendFeedbackAction({}, form({ ...filled, body: 'плохо' }))).toMatchObject({
      error: expect.stringContaining('не меньше'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a foreign origin; an API error keeps what was typed', async () => {
    state.headers.set('origin', 'https://evil.example');
    expect((await sendFeedbackAction({}, form(filled))).error).toBe(FOREIGN_ORIGIN);
    expect(fetchMock).not.toHaveBeenCalled();
    state.headers.set('origin', 'http://localhost:3000');
    fetchMock.mockResolvedValue(
      json(429, { code: 'DAILY_QUOTA_EXCEEDED', message: 'Не больше 10 обращений в сутки' }),
    );
    expect(await sendFeedbackAction({}, form(filled))).toEqual({
      error: 'Не больше 10 обращений в сутки',
      values: { kind: 'BUG', body: filled.body },
    });
  });
});

describe('replyFeedbackFormAction', () => {
  const reply = (fields: Record<string, string>) =>
    form({ args: encodeFormArgs(['f1', '/admin/feedback?status=open']), ...fields });

  it('replies and goes back to the queue', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'f1' }));
    await expect(replyFeedbackFormAction({}, reply({ reply: 'Исправим.' }))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/admin/feedback/f1/reply');
    expect(JSON.parse(init.body)).toEqual({ reply: 'Исправим.' });
    expect(state.redirectedTo).toBe('/admin/feedback?status=open');
  });

  it('an empty reply and «already answered» are shown next to the form', async () => {
    expect((await replyFeedbackFormAction({}, reply({ reply: ' ' }))).error).toBe(
      'Напишите ответ.',
    );
    fetchMock.mockResolvedValue(json(409, { code: 'CONFLICT', message: 'x' }));
    expect(await replyFeedbackFormAction({}, reply({ reply: 'Исправим.' }))).toEqual({
      error: 'На это обращение уже ответили: обновите страницу.',
      reply: 'Исправим.',
    });
  });
});
