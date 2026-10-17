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
const { closeJobAction, createJobAction, updateJobAction } = await import('./actions');

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

  it('redirects to login without a session and never calls the API', async () => {
    state.cookies.clear();
    await expect(createJobAction({}, form(job))).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/login?next=%2Faccount%2Fjobs%2Fnew');
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('sends the user to login when the API session expired', async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    await expect(createJobAction({}, form(job))).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toMatch(/^\/login\?next=/);
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

  it('closes the job and redirects with a notice', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'job1', status: 'CLOSED' }));
    await expect(closeJobAction('job1', {}, form({}))).rejects.toThrow('NEXT_REDIRECT');
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/v1/me/jobs/job1/close');
    expect(state.redirectedTo).toBe('/account/jobs/job1?closed=1');
  });

  it('shows a conflict when the job is already closed', async () => {
    fetchMock.mockResolvedValue(json(409, { message: 'Заказ уже закрыт' }));
    expect((await closeJobAction('job1', {}, form({}))).error).toBe('Заказ уже закрыт');
  });
});
