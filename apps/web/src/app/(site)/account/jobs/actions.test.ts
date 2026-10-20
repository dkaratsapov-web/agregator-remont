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
const { closeJobAction, createJobAction, deleteDraftAction, saveDraftAction, updateJobAction } =
  await import('./actions');

const job = {
  title: 'Укладка плитки',
  description: 'Нужно уложить плитку в ванной, около 20 м².',
  category: 'TILING',
  city: 'Москва',
  budgetMin: '40 000',
  budgetMax: '',
  details: JSON.stringify({ rooms: ['bathroom'], surfaces: ['walls'], tileType: 'ceramic' }),
};
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

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

describe('createJobAction', () => {
  it('sends only form fields with the session token and redirects to the new job', async () => {
    fetchMock.mockResolvedValue(json(201, { id: 'job1' }));
    await expect(createJobAction({}, form({ ...job, ownerId: 'someone' }))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/me/jobs');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({
      title: job.title,
      description: job.description,
      category: 'TILING',
      city: 'Москва',
      budgetMin: 40000,
      budgetMax: null,
      details: { rooms: ['bathroom'], surfaces: ['walls'], tileType: 'ceramic' },
      extraItems: [],
    });
    expect(state.redirectedTo).toBe('/account/jobs/job1?created=1');
  });

  it('returns field issues and keeps answers when the questionnaire is incomplete', async () => {
    const details = JSON.stringify({ rooms: ['bathroom'] });
    const result = await createJobAction({}, form({ ...job, details }));
    expect(result.error).toBe('Ответьте на вопрос «Поверхности»');
    expect(result.issues?.map((issue) => issue.questionId)).toEqual(['surfaces', 'tileType']);
    expect(result.values?.details).toBe(details);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses cities outside the service area before calling the API', async () => {
    const result = await createJobAction({}, form({ ...job, city: 'Самара' }));
    expect(result.error).toMatch(/Пока работаем только в Москве/);
    expect(result.issues?.[0].field).toBe('city');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('without a session keeps typed values and offers login in a new tab (MVP-4)', async () => {
    state.cookies.clear();
    const result = await createJobAction({}, form({ ...job, draftId: 'draft1' }));
    expect(state.redirectedTo).toBeUndefined();
    expect(result.error).toMatch(/Сессия закончилась/);
    expect(result.login).toBe('/login?next=%2Faccount%2Fjobs%2Fnew%3Fdraft%3Ddraft1');
    expect(result.values?.title).toBe(job.title);
    expect(result.values?.description).toBe(job.description);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the publish key so a retry returns the same job (MVP-1)', async () => {
    const requestId = '6f1c2a0e-8d4b-4c3a-9e7f-1a2b3c4d5e6f';
    fetchMock.mockImplementation(async () => json(201, { id: 'job1' }));
    await expect(createJobAction({}, form({ ...job, requestId }))).rejects.toThrow('NEXT_REDIRECT');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).requestId).toBe(requestId);
    // Неверный ключ не уходит в API.
    fetchMock.mockClear();
    await expect(createJobAction({}, form({ ...job, requestId: 'x' }))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('requestId');
  });

  it('rejects a cross-origin submission', async () => {
    state.headers.set('origin', 'https://evil.example');
    const result = await createJobAction({}, form(job));
    expect(result.error).toMatch(/Запрос отклонён/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows API validation and role errors, keeping typed values', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { message: ['Название: от 5 до 160 символов'] }));
    const invalid = await createJobAction({}, form(job));
    expect(invalid.error).toBe('Название: от 5 до 160 символов');
    expect(invalid.values?.title).toBe(job.title);

    fetchMock.mockResolvedValueOnce(json(403, { message: 'Недостаточно прав' }));
    expect((await createJobAction({}, form(job))).error).toMatch(/только заказчики/);
  });

  it('keeps typed values when the API session expired', async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    const result = await createJobAction({}, form(job));
    expect(state.redirectedTo).toBeUndefined();
    expect(result.login).toBe('/login?next=%2Faccount%2Fjobs%2Fnew');
    expect(result.values?.title).toBe(job.title);
  });
});

describe('updateJobAction and closeJobAction', () => {
  it('reports another user job as not found', async () => {
    fetchMock.mockResolvedValue(json(404, { message: 'Заказ не найден' }));
    const result = await updateJobAction('job1', {}, form(job));
    expect(result.error).toMatch(/не найден/);
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
  });

  it('refuses malformed ids before calling the API', async () => {
    expect((await updateJobAction('../admin', {}, form(job))).error).toMatch(/не найден/);
    expect((await closeJobAction('a/b', {}, form({}))).error).toMatch(/не найден/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the form version and shows the conflict when the job changed elsewhere (MVP-2)', async () => {
    const version = '2026-10-19T08:00:00.123Z';
    fetchMock.mockResolvedValue(json(409, { message: 'Заказ изменён в другой вкладке или окне.' }));
    const result = await updateJobAction('job1', {}, form({ ...job, expectedUpdatedAt: version }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).expectedUpdatedAt).toBe(version);
    expect(result.error).toMatch(/изменён в другой вкладке/);
    expect(result.values?.title).toBe(job.title);
  });

  it('keeps edits when the session expired during an update', async () => {
    state.cookies.clear();
    const result = await updateJobAction('job1', {}, form(job));
    expect(state.redirectedTo).toBeUndefined();
    expect(result.login).toBe('/login?next=%2Faccount%2Fjobs%2Fjob1');
    expect(result.values?.title).toBe(job.title);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['COMPLETED', 'done'],
    ['CANCELLED', 'cancelled'],
  ])('closes the job with outcome %s and redirects with a notice (MVP-5)', async (outcome, q) => {
    fetchMock.mockResolvedValue(json(200, { id: 'job1', status: 'CLOSED' }));
    await expect(closeJobAction('job1', {}, form({ outcome }))).rejects.toThrow('NEXT_REDIRECT');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/me/jobs/job1/close');
    expect(JSON.parse(init.body)).toEqual({ outcome });
    expect(state.redirectedTo).toBe(`/account/jobs/job1?closed=${q}`);
  });

  it('asks for an outcome before calling the API', async () => {
    expect((await closeJobAction('job1', {}, form({}))).error).toMatch(/чем закончился/);
    expect((await closeJobAction('job1', {}, form({ outcome: 'DONE' }))).error).toMatch(
      /чем закончился/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a conflict when the job is already closed', async () => {
    fetchMock.mockResolvedValue(json(409, { message: 'Заказ уже закрыт' }));
    expect((await closeJobAction('job1', {}, form({ outcome: 'CANCELLED' }))).error).toBe(
      'Заказ уже закрыт',
    );
  });
});

describe('saveDraftAction', () => {
  const version = '2026-10-19T08:00:00.123Z';
  const draft = (id: string, updatedAt: string) => json(200, { id, updatedAt });

  it('creates a draft without a version, then replaces it with the last saved version', async () => {
    fetchMock.mockResolvedValueOnce(draft('d1', version));
    const created = await saveDraftAction(form({ title: 'Плитка', expectedUpdatedAt: version }));
    expect(created).toEqual({ ok: true, draftId: 'd1', savedAt: version });
    const [url, init] = fetchMock.mock.calls[0];
    expect([url, init.method]).toEqual(['http://api.test/v1/me/drafts', 'POST']);
    expect(JSON.parse(init.body)).not.toHaveProperty('expectedUpdatedAt');

    fetchMock.mockResolvedValueOnce(draft('d1', '2026-10-19T08:00:05.000Z'));
    await saveDraftAction(form({ title: 'Плитка', draftId: 'd1', expectedUpdatedAt: version }));
    const [putUrl, put] = fetchMock.mock.calls[1];
    expect([putUrl, put.method]).toEqual(['http://api.test/v1/me/drafts/d1', 'PUT']);
    expect(JSON.parse(put.body).expectedUpdatedAt).toBe(version);
  });

  it('replaces without a version when the form chose to keep its own copy', async () => {
    fetchMock.mockResolvedValueOnce(draft('d1', version));
    await saveDraftAction(form({ title: 'Плитка', draftId: 'd1', expectedUpdatedAt: '' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('expectedUpdatedAt');
  });

  it('reports a conflict when the draft changed in another tab (MVP-6)', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { message: 'Черновик изменён в другой вкладке.' }));
    const result = await saveDraftAction(
      form({ title: 'Плитка', draftId: 'd1', expectedUpdatedAt: version }),
    );
    expect(result).toMatchObject({ ok: false, conflict: true });
  });

  it('forgets a published or deleted draft instead of recreating it', async () => {
    fetchMock.mockResolvedValueOnce(json(404, { message: 'Черновик не найден' }));
    const result = await saveDraftAction(form({ title: 'Плитка', draftId: 'd1' }));
    expect(result).toMatchObject({ ok: false, reset: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('offers login in a new tab when the session is gone, without redirecting', async () => {
    state.cookies.clear();
    const result = await saveDraftAction(form({ title: 'Плитка', draftId: 'd1' }));
    expect(result).toMatchObject({
      ok: false,
      login: '/login?next=%2Faccount%2Fjobs%2Fnew%3Fdraft%3Dd1',
    });
    expect(state.redirectedTo).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();

    state.cookies.set('ar_session', 'tok');
    fetchMock.mockResolvedValueOnce(json(401, {}));
    expect(await saveDraftAction(form({ title: 'Плитка' }))).toMatchObject({
      ok: false,
      login: '/login?next=%2Faccount%2Fjobs%2Fnew',
    });
  });

  it('rejects a cross-origin save', async () => {
    state.headers.set('origin', 'https://evil.example');
    expect(await saveDraftAction(form({ title: 'Плитка' }))).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deleteDraftAction', () => {
  it('deletes the draft and returns to my jobs', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteDraftAction('d1')).rejects.toThrow('NEXT_REDIRECT');
    const [url, init] = fetchMock.mock.calls[0];
    expect([url, init.method]).toEqual(['http://api.test/v1/me/drafts/d1', 'DELETE']);
    expect(state.redirectedTo).toBe('/account/jobs?draftDeleted=1');
  });

  it('treats an already deleted draft as deleted (another tab)', async () => {
    fetchMock.mockResolvedValueOnce(json(404, { message: 'Черновик не найден' }));
    await expect(deleteDraftAction('d1')).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/account/jobs?draftDeleted=1');
  });

  it('reports a failure instead of claiming success', async () => {
    fetchMock.mockResolvedValueOnce(json(500, {}));
    await expect(deleteDraftAction('d1')).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/account/jobs?draftError=1');
  });

  it('refuses bad ids and foreign origins without calling the API', async () => {
    await expect(deleteDraftAction('../x')).rejects.toThrow('NEXT_REDIRECT');
    state.headers.set('origin', 'https://evil.example');
    await expect(deleteDraftAction('d1')).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/account/jobs');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
