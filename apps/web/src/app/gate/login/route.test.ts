import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Вход тестировщика под параллельной нагрузкой (AUDIT_FINDINGS SEC-1): попытка учитывается до
 * проверки пароля, поэтому одновременные запросы не обходят лимит, а одновременных проверок
 * bcrypt не больше четырёх.
 */

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  compares: 0,
  release: [] as (() => void)[],
  hold: false,
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => state.headers.get(name) ?? null }),
}));

// bcrypt: счётчик вызовов; пароль «right» верный. При hold ответ ждёт release (запросы «в работе»).
vi.mock('bcryptjs', () => ({
  default: {
    compare: async (password: string) => {
      state.compares += 1;
      if (state.hold) await new Promise<void>((resolve) => state.release.push(resolve));
      return password === 'right';
    },
  },
}));

const { POST } = await import('./route');

let ipCounter = 0;
function attempt(ip: string, password: string) {
  return POST(
    new Request('http://localhost:3000/gate/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ login: 'tester', password, next: '/jobs' }).toString(),
    }),
  ).then((res) => new URL(res.headers.get('location') ?? '', 'http://x').searchParams.get('error'));
}

beforeEach(() => {
  ipCounter += 1;
  state.compares = 0;
  state.release = [];
  state.hold = false;
  state.headers.clear();
  state.headers.set('origin', 'http://localhost:3000');
  state.headers.set('host', 'localhost:3000');
  state.headers.set('sec-fetch-site', 'same-origin');
  state.headers.set('x-forwarded-for', `203.0.113.${ipCounter}`);
  vi.stubEnv('BASIC_AUTH_USER', 'tester');
  vi.stubEnv('BASIC_AUTH_HASH', `$2a$04$${'a'.repeat(53)}`);
  vi.stubEnv('WEB_TRUST_PROXY_HOPS', '1');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /gate/login', () => {
  it('locks after 10 wrong passwords in a row, a correct one resets the counter', async () => {
    const ip = `203.0.113.${ipCounter}`;
    for (let i = 0; i < 9; i += 1) expect(await attempt(ip, 'wrong')).toBe('wrong');
    expect(await attempt(ip, 'right')).toBeNull();
    for (let i = 0; i < 10; i += 1) expect(await attempt(ip, 'wrong')).toBe('wrong');
    expect(await attempt(ip, 'right')).toBe('locked');
    expect(state.compares).toBe(20);
  });

  it('parallel attempts do not bypass the limit and run at most 4 bcrypt checks at once', async () => {
    const ip = `203.0.113.${ipCounter}`;
    state.hold = true;
    const pending = Array.from({ length: 20 }, () => attempt(ip, 'wrong'));
    await vi.waitFor(() => expect(state.compares).toBe(4));
    // Пока четыре проверки идут, остальные шестнадцать сразу получают отказ, bcrypt не вызывается.
    state.hold = false;
    for (const resolve of state.release) resolve();
    const results = await Promise.all(pending);
    expect(state.compares).toBe(4);
    expect(results.filter((r) => r === 'wrong')).toHaveLength(4);
    expect(results.filter((r) => r === 'busy')).toHaveLength(16);

    // Ещё серии: «занято» не считается попыткой, но всего неудачных проверок с одного IP не
    // больше 10 — дальше блокировка, сколько бы запросов ни пришло одновременно.
    let last: (string | null)[] = [];
    for (let batch = 0; batch < 4; batch += 1) {
      last = await Promise.all(Array.from({ length: 20 }, () => attempt(ip, 'wrong')));
    }
    expect(state.compares).toBe(10);
    expect(last.every((r) => r === 'locked')).toBe(true);
  });
});
