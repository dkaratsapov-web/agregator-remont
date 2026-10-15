import 'server-only';
import type { AuthSessionDto, JobCategory, JobDto, Paginated, UserDto } from '@agregator/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Сообщение API для пользователя (валидация, конфликт), если оно было в ответе. */
    readonly userMessage?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Токен сессии пользователя; передаётся API как Bearer. */
  token?: string;
  /** IP посетителя для rate limit в API (API доверяет ему только при настроенном TRUST_PROXY). */
  clientIp?: string;
}

const REQUEST_TIMEOUT_MS = 5000;

function apiBaseUrl(): string {
  const url = process.env.API_URL;
  if (!url) {
    throw new ApiError('API_URL is not configured');
  }
  return url.replace(/\/+$/, '');
}

async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.clientIp) headers['X-Forwarded-For'] = options.clientIp;

  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? 'GET',
      cache: 'no-store',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(`API request failed: ${(error as Error).message}`);
  }
}

export async function getJobs(params: {
  page: number;
  limit: number;
  category?: JobCategory;
}): Promise<Paginated<JobDto>> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.category) query.set('category', params.category);

  const res = await request(`/v1/jobs?${query.toString()}`);
  if (!res.ok) {
    throw new ApiError(`GET /v1/jobs responded ${res.status}`, res.status);
  }
  return (await res.json()) as Paginated<JobDto>;
}

/** null, если заказа нет (404); остальные ошибки пробрасываются. */
export async function getJob(id: string): Promise<JobDto | null> {
  const res = await request(`/v1/jobs/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ApiError(`GET /v1/jobs/:id responded ${res.status}`, res.status);
  }
  return (await res.json()) as JobDto;
}

async function userMessageOf(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === 'string') return body.message;
    if (Array.isArray(body.message) && typeof body.message[0] === 'string') return body.message[0];
  } catch {
    // тело не JSON
  }
  return undefined;
}

async function expectJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    throw new ApiError(`${label} responded ${res.status}`, res.status, await userMessageOf(res));
  }
  return (await res.json()) as T;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role: string;
}

export async function registerUser(
  input: RegisterInput,
  clientIp?: string,
): Promise<AuthSessionDto> {
  const res = await request('/v1/auth/register', { method: 'POST', body: input, clientIp });
  return expectJson<AuthSessionDto>(res, 'POST /v1/auth/register');
}

export async function loginUser(
  input: { email: string; password: string },
  clientIp?: string,
): Promise<AuthSessionDto> {
  const res = await request('/v1/auth/login', { method: 'POST', body: input, clientIp });
  return expectJson<AuthSessionDto>(res, 'POST /v1/auth/login');
}

/** Ошибки игнорируются: локальная cookie удаляется в любом случае. */
export async function logoutSession(token: string): Promise<void> {
  try {
    await request('/v1/auth/logout', { method: 'POST', token });
  } catch {
    // API недоступен: сессия истечёт сама
  }
}

/** null, если сессия недействительна (401). */
export async function getMe(token: string): Promise<UserDto | null> {
  const res = await request('/v1/me', { token });
  if (res.status === 401) return null;
  return expectJson<UserDto>(res, 'GET /v1/me');
}
