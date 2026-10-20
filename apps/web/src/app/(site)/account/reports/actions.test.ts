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
const { reportAction } = await import('./actions');
const { resolveReportAction, setBlockedAction, setHiddenAction } =
  await import('../../admin/reports/actions');

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
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

describe('reportAction', () => {
  it('sends the report and says it was received', async () => {
    fetchMock.mockResolvedValue(json(201, { id: 'r1', duplicate: false }));
    const res = await reportAction(
      'MESSAGE',
      'm1',
      '/account/jobs/j1',
      {},
      form({ js: '1', reason: 'FRAUD', comment: '  Просит предоплату  ' }),
    );
    expect(res).toEqual({ sent: { duplicate: false } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/reports');
    expect(JSON.parse(init.body)).toEqual({
      targetType: 'MESSAGE',
      targetId: 'm1',
      reason: 'FRAUD',
      comment: 'Просит предоплату',
    });
  });

  it('checks the form before calling the API', async () => {
    expect(
      (await reportAction('JOB', 'j1', '/jobs/j1', {}, form({ js: '1', reason: 'NOPE' }))).error,
    ).toBe('Выберите причину.');
    expect(
      (
        await reportAction(
          'JOB',
          'j1',
          '/jobs/j1',
          {},
          form({ js: '1', reason: 'OTHER', comment: 'ой' }),
        )
      ).error,
    ).toMatch(/от 5 символов/);
    expect(
      (await reportAction('JOB', '../x', '/jobs/j1', {}, form({ js: '1', reason: 'SPAM' }))).error,
    ).toMatch(/обновите страницу/);
    state.headers.set('origin', 'https://evil.example');
    expect(
      (await reportAction('JOB', 'j1', '/jobs/j1', {}, form({ js: '1', reason: 'SPAM' }))).error,
    ).toMatch(/Запрос отклонён/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains a duplicate, a hidden target, the daily limit and an expired session', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: 'r1', duplicate: true }));
    expect(
      await reportAction('JOB', 'j1', '/jobs/j1', {}, form({ js: '1', reason: 'SPAM' })),
    ).toEqual({
      sent: { duplicate: true },
    });
    fetchMock.mockResolvedValueOnce(json(404, { message: 'Заказ не найден' }));
    expect(
      (await reportAction('JOB', 'j1', '/jobs/j1', {}, form({ js: '1', reason: 'SPAM' }))).error,
    ).toMatch(/скрыли или удалили/);
    fetchMock.mockResolvedValueOnce(json(429, { message: 'много' }));
    expect(
      (await reportAction('JOB', 'j1', '/jobs/j1', {}, form({ js: '1', reason: 'SPAM' }))).error,
    ).toMatch(/за сутки/);
    fetchMock.mockResolvedValueOnce(json(401, { message: 'Требуется вход' }));
    const expired = await reportAction(
      'JOB',
      'j1',
      '/jobs/j1',
      {},
      form({ js: '1', reason: 'SPAM' }),
    );
    expect(expired.login).toBe('/login?next=%2Fjobs%2Fj1');
  });
});

describe('reportAction without JS', () => {
  it('goes back to the page with the outcome in the address', async () => {
    fetchMock.mockImplementationOnce(async () => json(201, { id: 'r1', duplicate: false }));
    await expect(
      reportAction('MESSAGE', 'm1', '/account/jobs/j1#chat', {}, form({ reason: 'ABUSE' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/account/jobs/j1?report=sent#chat');
    await expect(
      reportAction('JOB', 'j1', '/jobs/j1', {}, form({ reason: 'OTHER' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/jobs/j1?report=invalid');
    fetchMock.mockImplementationOnce(async () => json(404, { message: 'нет' }));
    await expect(
      reportAction('BID', 'b1', '/account/jobs/j1', {}, form({ reason: 'SPAM' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/account/jobs/j1?report=gone');
  });
});

describe('admin moderation actions', () => {
  const back = '/admin/reports?status=OPEN';

  it('resolves a report with the chosen decision and a note', async () => {
    fetchMock.mockImplementation(async () => json(200, {}));
    await expect(
      resolveReportAction('r1', back, {}, form({ decision: 'DISMISSED', text: 'Заказ настоящий' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/admin/reports/r1/resolve');
    expect(JSON.parse(init.body)).toEqual({ status: 'DISMISSED', note: 'Заказ настоящий' });
    expect(state.redirectedTo).toBe(back);
  });

  it('hides content and blocks users with a reason; short reasons stay in the form', async () => {
    fetchMock.mockImplementation(async () => json(200, {}));
    await expect(
      setHiddenAction('messages', 'm1', true, back, {}, form({ text: 'Просьба о предоплате' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/v1/admin/messages/m1/hidden');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      hidden: true,
      reason: 'Просьба о предоплате',
    });
    await expect(
      setBlockedAction('u1', true, back, {}, form({ text: 'Мошенничество' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(fetchMock.mock.calls[1][0]).toBe('http://api.test/v1/admin/users/u1/blocked');
    expect((await setBlockedAction('u1', true, back, {}, form({ text: 'нет' }))).error).toMatch(
      /Причина/,
    );
    expect(
      (await resolveReportAction('r1', back, {}, form({ decision: 'OPEN', text: 'Что-то' }))).error,
    ).toBe('Выберите решение.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows API refusals in the form', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { message: 'Жалоба уже разобрана' }));
    expect(
      (await resolveReportAction('r1', back, {}, form({ decision: 'RESOLVED', text: 'Скрыли' })))
        .error,
    ).toBe('Жалобу уже разобрали.');
    fetchMock.mockResolvedValueOnce(json(409, { message: 'Администратора заблокировать нельзя' }));
    expect((await setBlockedAction('u1', true, back, {}, form({ text: 'Проверка' }))).error).toBe(
      'Администратора заблокировать нельзя',
    );
  });
});
