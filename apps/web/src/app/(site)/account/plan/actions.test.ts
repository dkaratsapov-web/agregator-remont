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
const actions = await import('./actions');

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const plan = (version: number) => ({ jobId: 'job1', version, status: 'DRAFT', stages: [] });
const BACK = '/account/work/job1';
const call = (index = 0) => {
  const [url, init] = fetchMock.mock.calls[index];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
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

describe('savePlanAction', () => {
  const stages = { 'stage-0-title': 'Демонтаж', 'stage-0-durationDays': '2', sequential: 'on' };

  it('saves the draft and returns with a notice', async () => {
    fetchMock.mockResolvedValue(json(200, plan(1)));
    await expect(
      actions.savePlanAction('job1', 0, BACK, {}, form({ ...stages, intent: 'save' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(call()).toEqual({
      url: 'http://api.test/v1/jobs/job1/plan',
      method: 'PUT',
      body: {
        version: 0,
        sequential: true,
        stages: [{ title: 'Демонтаж', description: '', durationDays: 2 }],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.redirectedTo).toBe(`${BACK}?plan=saved`);
  });

  it('propose saves first, then proposes with the new version', async () => {
    fetchMock.mockResolvedValueOnce(json(200, plan(4))).mockResolvedValueOnce(json(200, plan(5)));
    await expect(
      actions.savePlanAction('job1', 3, BACK, {}, form({ ...stages, intent: 'propose' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(call(1)).toMatchObject({
      url: 'http://api.test/v1/jobs/job1/plan/propose',
      body: { version: 4 },
    });
    expect(state.redirectedTo).toBe(`${BACK}?plan=proposed`);
  });

  it('keeps the input on field errors and on a stale version', async () => {
    const invalid = await actions.savePlanAction(
      'job1',
      0,
      BACK,
      {},
      form({ 'stage-0-title': 'ab', intent: 'propose' }),
    );
    expect(invalid.fields).toHaveProperty('stage-0-title');
    expect(invalid.values?.stages[0].title).toBe('ab');
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(json(409, { message: 'План изменился, пока вы его смотрели' }));
    const stale = await actions.savePlanAction('job1', 0, BACK, {}, form(stages));
    expect(stale.error).toContain('План изменился');
    expect(stale.values?.stages[0].title).toBe('Демонтаж');
  });

  it('expired session keeps the input and offers a login link', async () => {
    fetchMock.mockResolvedValue(json(401, { message: 'Unauthorized' }));
    const result = await actions.savePlanAction('job1', 0, BACK, {}, form(stages));
    expect(result.login).toBe(`/login?next=${encodeURIComponent(BACK)}`);
    expect(result.values?.stages[0].title).toBe('Демонтаж');
  });

  it('rejects a foreign origin and a malformed job id without calling the API', async () => {
    state.headers.set('origin', 'https://evil.example');
    expect((await actions.savePlanAction('job1', 0, BACK, {}, form(stages))).error).toMatch(
      /Запрос отклонён/,
    );
    state.headers.set('origin', 'http://localhost:3000');
    expect((await actions.savePlanAction('../x', 0, BACK, {}, form(stages))).error).toContain(
      'не найден',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never redirects outside the site', async () => {
    fetchMock.mockResolvedValue(json(200, plan(1)));
    await expect(
      actions.savePlanAction('job1', 0, 'https://evil.example/x', {}, form(stages)),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo?.startsWith('/')).toBe(true);
    expect(state.redirectedTo).not.toContain('evil');
  });
});

describe('plan transitions without input', () => {
  it.each([
    [
      'setPlanAuthorAction',
      () => actions.setPlanAuthorAction('job1', 2, 'OWNER', BACK),
      '/plan/author',
      { version: 2, author: 'OWNER' },
      'author',
    ],
    [
      'approvePlanAction',
      () => actions.approvePlanAction('job1', 5, BACK),
      '/plan/approve',
      { version: 5 },
      'approved',
    ],
    [
      'acceptStageAction',
      () => actions.acceptStageAction('job1', 's1', BACK),
      '/stages/s1/accept',
      {},
      'accepted',
    ],
  ])('%s calls the API and returns with a notice', async (_name, run, path, body, notice) => {
    fetchMock.mockResolvedValue(json(200, plan(3)));
    await expect(run()).rejects.toThrow('NEXT_REDIRECT');
    expect(call()).toEqual({ url: `http://api.test/v1/jobs/job1${path}`, method: 'POST', body });
    expect(state.redirectedTo).toBe(`${BACK}?plan=${notice}`);
  });

  it('shows the API message on a conflict and sends an expired session to login', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { message: 'Принять можно только сданный этап' }));
    expect((await actions.acceptStageAction('job1', 's1', BACK)).error).toBe(
      'Принять можно только сданный этап',
    );
    fetchMock.mockResolvedValueOnce(json(404, { message: 'Заказ не найден' }));
    expect((await actions.approvePlanAction('job1', 1, BACK)).error).toContain('не участник');
    fetchMock.mockResolvedValueOnce(json(401, {}));
    await expect(actions.setPlanAuthorAction('job1', 1, 'OWNER', BACK)).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(state.redirectedTo).toContain('/login');
  });

  it('rejects a malformed stage id without calling the API', async () => {
    expect((await actions.acceptStageAction('job1', 'a/b', BACK)).error).toContain('не найден');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('transitions with a comment', () => {
  it.each([
    [
      'returnPlanAction',
      (f: FormData) => actions.returnPlanAction('job1', 2, BACK, {}, f),
      'reason',
      '/plan/return',
      { version: 2, reason: 'Добавьте уборку' },
      'returned',
    ],
    [
      'submitStageAction',
      (f: FormData) => actions.submitStageAction('job1', 's1', BACK, {}, f),
      'comment',
      '/stages/s1/submit',
      { comment: 'Добавьте уборку' },
      'submitted',
    ],
    [
      'reworkStageAction',
      (f: FormData) => actions.reworkStageAction('job1', 's1', BACK, {}, f),
      'comment',
      '/stages/s1/rework',
      { comment: 'Добавьте уборку' },
      'rework',
    ],
  ])(
    '%s trims the comment, calls the API, returns with a notice',
    async (_n, run, field, path, body, notice) => {
      fetchMock.mockResolvedValue(json(200, plan(3)));
      await expect(run(form({ [field]: '  Добавьте уборку  ' }))).rejects.toThrow('NEXT_REDIRECT');
      expect(call()).toEqual({ url: `http://api.test/v1/jobs/job1${path}`, method: 'POST', body });
      expect(state.redirectedTo).toBe(`${BACK}?plan=${notice}`);
    },
  );

  it('short comment: error, input kept, no API call', async () => {
    const result = await actions.reworkStageAction('job1', 's1', BACK, {}, form({ comment: 'да' }));
    expect(result).toMatchObject({ comment: 'да' });
    expect(result.error).toContain('Что доработать');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('expired session keeps the comment', async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    const result = await actions.submitStageAction(
      'job1',
      's1',
      BACK,
      {},
      form({ comment: 'Этап готов полностью' }),
    );
    expect(result).toMatchObject({
      comment: 'Этап готов полностью',
      login: expect.stringContaining('/login'),
    });
  });

  it('API error keeps the comment', async () => {
    fetchMock.mockResolvedValue(json(409, { message: 'Этап уже принят' }));
    const result = await actions.returnPlanAction(
      'job1',
      2,
      BACK,
      {},
      form({ reason: 'Поменяйте сроки' }),
    );
    expect(result).toEqual({ error: 'Этап уже принят', comment: 'Поменяйте сроки' });
  });
});

describe('quitJobAction', () => {
  it('quits and returns to the bids list', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      actions.quitJobAction('job1', BACK, {}, form({ reason: ' Не успеваю по срокам ' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(call()).toEqual({
      url: 'http://api.test/v1/jobs/job1/quit',
      method: 'POST',
      body: { reason: 'Не успеваю по срокам' },
    });
    expect(state.redirectedTo).toBe('/account/bids?quit=1');
  });

  it('short reason, API errors and an expired session keep the reason', async () => {
    expect(await actions.quitJobAction('job1', BACK, {}, form({ reason: 'нет' }))).toMatchObject({
      comment: 'нет',
      error: expect.stringContaining('Причина'),
    });
    fetchMock.mockResolvedValueOnce(json(409, { message: 'Заказ не в работе' }));
    expect(await actions.quitJobAction('job1', BACK, {}, form({ reason: 'Не успеваю' }))).toEqual({
      error: 'Заказ не в работе',
      comment: 'Не успеваю',
    });
    fetchMock.mockResolvedValueOnce(json(401, {}));
    expect(
      await actions.quitJobAction('job1', BACK, {}, form({ reason: 'Не успеваю' })),
    ).toMatchObject({
      comment: 'Не успеваю',
      login: expect.stringContaining('/login'),
    });
  });
});

describe('photos and messages', () => {
  const photo = (size = 10, type = 'image/jpeg') =>
    new File([new Uint8Array(size)], 'IMG_1.jpg', { type });
  const multipart = (index = 0) => {
    const [url, init] = fetchMock.mock.calls[index];
    return { url, method: init.method, body: init.body as FormData };
  };

  it('stage submission with photos is sent as multipart', async () => {
    fetchMock.mockResolvedValue(json(200, plan(3)));
    const fd = form({ comment: 'Плитка уложена полностью' });
    fd.append('photos', photo());
    fd.append('photos', photo(20, 'image/png'));
    await expect(actions.submitStageAction('job1', 's1', BACK, {}, fd)).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    const sent = multipart();
    expect(sent.url).toBe('http://api.test/v1/jobs/job1/stages/s1/submit');
    expect(sent.body.get('comment')).toBe('Плитка уложена полностью');
    expect(sent.body.getAll('photos')).toHaveLength(2);
    expect(state.redirectedTo).toBe(`${BACK}?plan=submitted`);
  });

  it('too many photos: error, comment kept, no API call', async () => {
    const fd = form({ comment: 'Плитка уложена полностью' });
    for (let i = 0; i < 6; i += 1) fd.append('photos', photo());
    expect(await actions.submitStageAction('job1', 's1', BACK, {}, fd)).toEqual({
      error: 'Не больше 5 фото за раз.',
      comment: 'Плитка уложена полностью',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a message with its form key and photos, then returns to the conversation', async () => {
    fetchMock.mockResolvedValue(json(200, { jobId: 'job1', items: [] }));
    const fd = form({ body: '  Когда начнёте?  ' });
    fd.append('photos', photo());
    await expect(
      actions.sendMessageAction('job1', 'key-0001', `${BACK}?plan=approved`, {}, fd),
    ).rejects.toThrow('NEXT_REDIRECT');
    const sent = multipart();
    expect(sent.url).toBe('http://api.test/v1/jobs/job1/messages');
    expect(sent.method).toBe('POST');
    expect(sent.body.get('body')).toBe('Когда начнёте?');
    expect(sent.body.get('requestId')).toBe('key-0001');
    expect(sent.body.getAll('photos')).toHaveLength(1);
    expect(state.redirectedTo).toBe(`${BACK}?plan=approved#chat`);
  });

  it('empty or too long message: error without an API call, text kept', async () => {
    expect(
      await actions.sendMessageAction('job1', 'key-0001', BACK, {}, form({ body: '  ' })),
    ).toEqual({ error: 'Напишите сообщение или приложите фото.', comment: '  ' });
    const long = 'я'.repeat(2001);
    expect(
      (await actions.sendMessageAction('job1', 'key-0001', BACK, {}, form({ body: long }))).error,
    ).toContain('не больше 2000');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('closed job, expired session and a foreign origin keep the text', async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { message: 'Переписка открыта, пока заказ в работе' }),
    );
    expect(
      await actions.sendMessageAction('job1', 'key-0001', BACK, {}, form({ body: 'Спасибо' })),
    ).toEqual({ error: 'Переписка открыта, пока заказ в работе', comment: 'Спасибо' });
    fetchMock.mockResolvedValueOnce(json(401, {}));
    expect(
      await actions.sendMessageAction('job1', 'key-0001', BACK, {}, form({ body: 'Спасибо' })),
    ).toMatchObject({ comment: 'Спасибо', login: expect.stringContaining('/login') });
    fetchMock.mockResolvedValueOnce(json(413, { message: 'File too large' }));
    expect(
      (await actions.sendMessageAction('job1', 'key-0001', BACK, {}, form({ body: 'Фото' }))).error,
    ).toContain('не больше 8 МБ');
    state.headers.set('origin', 'https://evil.example');
    expect(
      await actions.sendMessageAction('job1', 'key-0001', BACK, {}, form({ body: 'Спасибо' })),
    ).toMatchObject({ error: expect.stringMatching(/Запрос отклонён/), comment: 'Спасибо' });
  });
});
