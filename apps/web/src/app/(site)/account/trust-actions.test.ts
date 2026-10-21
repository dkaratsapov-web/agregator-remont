import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFormArgs, type FormArg } from '@/lib/form-args';

// Действия «Аккаунты и доверие» и обёртки форм с параметрами в поле args (docs/NO_JS_FORMS.md).
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
    set: (name: string, value: string, opts?: { maxAge?: number }) => {
      if (opts?.maxAge === 0) state.cookies.delete(name);
      else state.cookies.set(name, value);
    },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    state.redirectedTo = to;
    throw new Error('NEXT_REDIRECT');
  },
}));

const fetchMock = vi.fn();
const { resetPasswordAction } = await import('../(auth)/actions');
const { createReviewAction } = await import('./reviews/actions');
const { favoriteFormAction } = await import('./favorites/actions');
const { markReportsSeenAction, reportFormAction } = await import('./reports/actions');
const { issueResetLinkFormAction } = await import('../admin/users/actions');
const {
  resolveFlagFormAction,
  setBlockedFormAction,
  setHiddenFormAction,
  resolveReportFormAction,
} = await import('../admin/reports/actions');
const plan = await import('./plan/actions');
const jobs = await import('./jobs/actions');
const bids = await import('./bids/actions');
const { setLeadProcessedFormAction } = await import('../admin/leads/actions');
const { revokeSessionFormAction } = await import('./settings/actions');
const passwordReset = await import('@/lib/password-reset');
const api = await import('@/lib/api');

const TOKEN = 'A'.repeat(43);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const form = (fields: Record<string, string>, args?: FormArg[]) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (args) fd.append('args', encodeFormArgs(args));
  return fd;
};
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
  return {
    url: String(url),
    method: init?.method,
    body: init?.body ? JSON.parse(init.body) : undefined,
  };
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

describe('reset password', () => {
  it('keeps only well-formed tokens in the cookie', async () => {
    expect(passwordReset.isResetToken(TOKEN)).toBe(true);
    expect(passwordReset.isResetToken('short')).toBe(false);
    await passwordReset.saveResetToken(TOKEN);
    expect(await passwordReset.readResetToken()).toBe(TOKEN);
    state.cookies.set('ar_reset', 'bad');
    expect(await passwordReset.readResetToken()).toBeUndefined();
    await passwordReset.clearResetToken();
    expect(state.cookies.has('ar_reset')).toBe(false);
  });

  it('checks the fields, then sets the new session and forgets the link', async () => {
    const short = await resetPasswordAction({}, form({ password: 'short', repeat: 'short' }));
    expect(short.fields?.password).toMatch(/от 10/);
    const differ = await resetPasswordAction(
      {},
      form({ password: 'long-password-1', repeat: 'long-password-2' }),
    );
    expect(differ.fields?.repeat).toMatch(/не совпадают/);
    const none = await resetPasswordAction(
      {},
      form({ password: 'long-password-1', repeat: 'long-password-1' }),
    );
    expect(none.error).toMatch(/Ссылка не найдена/);

    state.cookies.set('ar_reset', TOKEN);
    fetchMock.mockResolvedValue(
      json(200, { token: 'new', expiresAt: new Date(Date.now() + 1e6).toISOString(), user: {} }),
    );
    await expect(
      resetPasswordAction({}, form({ password: 'long-password-1', repeat: 'long-password-1' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/password-reset'))!;
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN, password: 'long-password-1' });
    expect(state.redirectedTo).toBe('/account?password=reset');
    expect(state.cookies.get('ar_session')).toBe('new');
    expect(state.cookies.has('ar_reset')).toBe(false);
  });

  it('an expired link is forgotten; a password equal to email is shown at the field', async () => {
    state.cookies.set('ar_reset', TOKEN);
    fetchMock.mockImplementation(async () =>
      json(400, { message: 'Ссылка для пароля недействительна' }),
    );
    const expired = await resetPasswordAction(
      {},
      form({ password: 'long-password-1', repeat: 'long-password-1' }),
    );
    expect(expired.error).toMatch(/недействительна/);
    expect(state.cookies.has('ar_reset')).toBe(false);
    state.cookies.set('ar_reset', TOKEN);
    fetchMock.mockImplementation(async () =>
      json(400, { message: 'Пароль не должен совпадать с email' }),
    );
    const same = await resetPasswordAction(
      {},
      form({ password: 'a@example.ru', repeat: 'a@example.ru' }),
    );
    expect(same.fields?.password).toMatch(/email/);
    state.headers.set('origin', 'https://evil.example');
    expect((await resetPasswordAction({}, form({}))).error).toMatch(/Запрос отклонён/);
  });

  it('admin issues a link built from the public origin', async () => {
    vi.stubEnv('WEB_PUBLIC_ORIGIN', 'https://remont.example');
    state.headers.set('origin', 'https://remont.example');
    fetchMock.mockImplementation(async () =>
      json(201, { token: TOKEN, expiresAt: '2026-10-22T00:00:00Z' }),
    );
    const res = await issueResetLinkFormAction({}, form({}, ['user1', '/admin/users']));
    expect(res.link).toBe(`https://remont.example/reset/${TOKEN}`);
    expect(lastCall().url).toBe('http://api.test/v1/admin/users/user1/password-reset');
    expect((await issueResetLinkFormAction({}, form({}, ['bad id', '/x']))).error).toMatch(
      /не найден/,
    );
    fetchMock.mockImplementation(async () => json(409, { message: 'Аккаунт заблокирован' }));
    expect((await issueResetLinkFormAction({}, form({}, ['user1', '/x']))).error).toMatch(
      /заблокирован/,
    );
  });
});

describe('review', () => {
  it('validates the rating, sends the review and returns to the job', async () => {
    expect((await createReviewAction({}, form({ jobId: 'job1', rating: '9' }))).error).toMatch(
      /от 1 до 5/,
    );
    expect((await createReviewAction({}, form({ jobId: 'bad id', rating: '5' }))).error).toMatch(
      /не найден/,
    );
    fetchMock.mockImplementation(async () => json(201, { id: 'r1' }));
    await expect(
      createReviewAction({}, form({ jobId: 'job1', rating: '5', text: '  Отлично  ' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(lastCall()).toMatchObject({
      url: 'http://api.test/v1/me/jobs/job1/review',
      body: { rating: 5, text: 'Отлично' },
    });
    expect(state.redirectedTo).toBe('/account/jobs/job1?reviewed=1#review');
  });

  it('keeps the input on a conflict and offers to sign in when the session ended', async () => {
    fetchMock.mockImplementation(async () =>
      json(409, { message: 'Отзыв по этому заказу уже оставлен' }),
    );
    const again = await createReviewAction({}, form({ jobId: 'job1', rating: '4', text: 'Ок' }));
    expect(again).toMatchObject({
      error: 'Отзыв по этому заказу уже оставлен',
      values: { text: 'Ок' },
    });
    fetchMock.mockImplementation(async () => json(401, {}));
    const expired = await createReviewAction({}, form({ jobId: 'job1', rating: '4' }));
    expect(expired.login).toMatch(/^\/login/);
  });
});

describe('favorites and my reports', () => {
  it('adds and removes a favorite, then returns to the page', async () => {
    fetchMock.mockImplementation(async () => json(200, { jobId: 'job1', favorite: true }));
    await expect(favoriteFormAction({}, form({}, ['job1', true, '/jobs/job1']))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(lastCall()).toMatchObject({
      url: 'http://api.test/v1/me/favorites/job1',
      method: 'PUT',
    });
    await expect(favoriteFormAction({}, form({}, ['job1', false, '/jobs/job1']))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(lastCall().method).toBe('DELETE');
    expect((await favoriteFormAction({}, form({}, ['bad id', true, '/']))).error).toMatch(
      /не найден/,
    );
    fetchMock.mockImplementation(async () => json(404, {}));
    expect((await favoriteFormAction({}, form({}, ['job1', true, '/']))).error).toMatch(/скрыт/);
  });

  it('marks decisions seen and reports through the form wrapper', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    expect(await markReportsSeenAction()).toEqual({ ok: true });
    fetchMock.mockImplementation(async () => json(500, {}));
    expect(await markReportsSeenAction()).toEqual({ ok: false });
    fetchMock.mockImplementation(async () => json(201, { id: 'r1', duplicate: false }));
    const res = await reportFormAction(
      {},
      form({ reason: 'SPAM', js: '1' }, ['JOB', 'job1', '/jobs/job1']),
    );
    expect(res.sent).toEqual({ duplicate: false });
  });
});

describe('admin form wrappers', () => {
  it('resolve a flag, hide a review, block a user and resolve a report', async () => {
    fetchMock.mockImplementation(async () => json(200, {}));
    await expect(
      resolveFlagFormAction({}, form({ decision: 'DISMISSED' }, ['f1', '/admin/reports'])),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(lastCall()).toMatchObject({
      url: 'http://api.test/v1/admin/flags/f1/resolve',
      body: { status: 'DISMISSED' },
    });
    expect((await resolveFlagFormAction({}, form({}, ['f1', '/']))).error).toMatch(/решение/);
    fetchMock.mockImplementation(async () => json(409, {}));
    expect(
      (await resolveFlagFormAction({}, form({ decision: 'RESOLVED' }, ['f1', '/']))).error,
    ).toMatch(/уже разобрали/);

    fetchMock.mockImplementation(async () => json(200, {}));
    await expect(
      setHiddenFormAction(
        {},
        form({ text: 'Оскорбления в отзыве' }, ['reviews', 'rv1', true, '/x']),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(lastCall().url).toBe('http://api.test/v1/admin/reviews/rv1/hidden');
    expect((await setHiddenFormAction({}, form({}, ['users', 'x', true, '/']))).error).toMatch(
      /не найдено/,
    );
    await expect(
      setBlockedFormAction({}, form({ text: 'Мошенничество' }, ['u1', true, '/x'])),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(lastCall()).toMatchObject({ body: { blocked: true, reason: 'Мошенничество' } });
    await expect(
      resolveReportFormAction(
        {},
        form({ decision: 'DISMISSED', text: 'Нарушения нет' }, ['r1', '/x']),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(lastCall().url).toBe('http://api.test/v1/admin/reports/r1/resolve');
  });

  it('lead, session, bid, job and plan wrappers pass their args through', async () => {
    fetchMock.mockImplementation(async () => json(200, {}));
    await expect(
      setLeadProcessedFormAction({}, form({}, ['l1', true, '/admin/leads'])),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(lastCall().url).toBe('http://api.test/v1/admin/leads/l1');
    expect((await revokeSessionFormAction({}, form({}, ['bad id']))).error).toMatch(/не найден/);
    expect((await bids.withdrawBidFormAction({}, form({}, ['bad id', '/']))).error).toBeTruthy();
    expect(
      (await bids.placeBidFormAction({}, form({ price: 'x' }, ['job1']))).fields?.price,
    ).toBeTruthy();
    expect((await jobs.acceptBidFormAction({}, form({}, ['job1', 'bad id']))).error).toMatch(
      /не найден/,
    );
    expect((await jobs.closeJobFormAction({}, form({}, ['job1']))).error).toMatch(/чем закончился/);
    expect((await jobs.updateJobFormAction({}, form({}, ['job1']))).error).toBeTruthy();
    // Неверные args — как неизвестный заказ.
    const notFound = /не найден/;
    expect((await plan.savePlanFormAction({}, form({}, []))).error).toMatch(notFound);
    expect(
      (await plan.setPlanAuthorFormAction({}, form({}, ['job1', 1, 'BOSS', '/']))).error,
    ).toMatch(notFound);
    expect((await plan.approvePlanFormAction({}, form({}, [1, 1, '/']))).error).toMatch(notFound);
    expect((await plan.returnPlanFormAction({}, form({}, []))).error).toMatch(notFound);
    expect((await plan.submitStageFormAction({}, form({}, ['job1', 'bad id', '/']))).error).toMatch(
      notFound,
    );
    expect((await plan.acceptStageFormAction({}, form({}, []))).error).toMatch(notFound);
    expect((await plan.reworkStageFormAction({}, form({}, []))).error).toMatch(notFound);
    expect((await plan.quitJobFormAction({}, form({}, []))).error).toMatch(notFound);
    expect((await plan.sendMessageFormAction({}, form({ body: 'Привет' }, []))).error).toMatch(
      notFound,
    );
    await expect(jobs.deleteDraftFormAction(form({}, ['bad id']))).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/account/jobs');
  });
});

describe('api client', () => {
  it('admin users, flags, my reports, contractor card and favorites', async () => {
    const page = { items: [], page: 1, limit: 20, total: 0 };
    fetchMock.mockImplementation(async () => json(200, page));
    await api.listAdminUsers('tok', 'иван', 2);
    expect(lastCall().url).toBe('http://api.test/v1/admin/users?page=2&q=%D0%B8%D0%B2%D0%B0%D0%BD');
    await api.listFlags('tok', 'OPEN', 1);
    expect(lastCall().url).toBe('http://api.test/v1/admin/flags?status=OPEN&page=1');
    await api.listMyReports('tok', 1);
    await api.listFavorites('tok', 3);
    expect(lastCall().url).toBe('http://api.test/v1/me/favorites?page=3');
    fetchMock.mockImplementation(async () => json(200, { jobIds: ['j1'] }));
    expect(await api.getFavoriteIds('tok')).toEqual(['j1']);
    fetchMock.mockImplementation(async () => json(404, {}));
    expect(await api.getContractor('100001', 1)).toBeNull();
    expect(await api.getJobReview('tok', 'job1')).toBeNull();
    fetchMock.mockImplementation(async () =>
      json(200, { canReview: true, review: null, contractor: null }),
    );
    expect((await api.getJobReview('tok', 'job1'))?.canReview).toBe(true);
    fetchMock.mockImplementation(async () => json(500, {}));
    await expect(api.listAdminUsers('tok', '', 1)).rejects.toThrow();
  });
});
