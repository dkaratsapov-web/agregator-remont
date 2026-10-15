import 'server-only';
import type { JobCategory, JobDto, Paginated } from '@agregator/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const REQUEST_TIMEOUT_MS = 5000;

function apiBaseUrl(): string {
  const url = process.env.API_URL;
  if (!url) {
    throw new ApiError('API_URL is not configured');
  }
  return url.replace(/\/+$/, '');
}

async function request(path: string): Promise<Response> {
  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
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
