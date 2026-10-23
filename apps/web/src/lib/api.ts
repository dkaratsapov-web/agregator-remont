import 'server-only';
import type {
  AdminUserDto,
  AnalyticsDto,
  PriceEstimatesDto,
  JobPostedDays,
  JobSort,
  AnalyticsPeriod,
  AuthSessionDto,
  ContactExchangeDto,
  ContentFlagDto,
  FavoriteIdsDto,
  FavoriteStateDto,
  JobReviewStateDto,
  MyReportDto,
  PasswordResetLinkDto,
  PublicContractorDto,
  ReviewDto,
  ReviewInput,
  BidInput,
  ContractorProfileDto,
  ContractorProfileInput,
  JobBidDto,
  MyBidDto,
  JobCategory,
  JobCloseOutcome,
  JobDto,
  JobDraftDto,
  JobDraftInput,
  JobInput,
  JobStatus,
  JobUpdateInput,
  LeadDto,
  LeadInput,
  OwnJobDto,
  Paginated,
  PasswordChangeInput,
  ProfileInput,
  SessionDto,
  UiPreferences,
  UserDto,
  JobMessagesDto,
  MarkNotificationsReadInput,
  BlockedStateDto,
  HiddenStateDto,
  ReportDto,
  ReportFilter,
  ReportInput,
  ReportReceivedDto,
  ResolveReportInput,
  NotificationsPageDto,
  NotificationsSummaryDto,
  JobPlanDto,
  PhotoSize,
  PlanInput,
  PlanParty,
} from '@agregator/shared';
import { PAGINATION } from '@agregator/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Сообщение API для пользователя (валидация, конфликт), если оно было в ответе. */
    readonly userMessage?: string,
    /** Машинный код ошибки API (ADR 0002): VALIDATION_FAILED, JOB_NOT_OPEN… */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Токен сессии пользователя; передаётся API как Bearer. */
  token?: string;
  /** IP посетителя для rate limit в API (API доверяет ему только при настроенном TRUST_PROXY). */
  clientIp?: string;
  /** User-Agent браузера: API подписывает им устройство в списке входов. */
  userAgent?: string;
  /** Готовое тело (multipart с фото); Content-Type выставит fetch. */
  formData?: FormData;
}

const REQUEST_TIMEOUT_MS = 5000;
const UPLOAD_TIMEOUT_MS = 20000;

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
  if (options.userAgent) headers['X-Client-User-Agent'] = options.userAgent.slice(0, 512);

  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? 'GET',
      cache: 'no-store',
      headers,
      body:
        options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: AbortSignal.timeout(options.formData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS),
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
  status?: JobStatus;
  city?: string;
  q?: string;
  budgetFrom?: number;
  budgetTo?: number;
  days?: JobPostedDays;
  noBids?: boolean;
  sort?: JobSort;
}): Promise<Paginated<JobDto>> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.category) query.set('category', params.category);
  if (params.status) query.set('status', params.status);
  if (params.city) query.set('city', params.city);
  if (params.q) query.set('q', params.q);
  if (params.budgetFrom !== undefined) query.set('budgetFrom', String(params.budgetFrom));
  if (params.budgetTo !== undefined) query.set('budgetTo', String(params.budgetTo));
  if (params.days) query.set('days', String(params.days));
  if (params.noBids) query.set('noBids', 'true');
  if (params.sort) query.set('sort', params.sort);

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

/** Ошибка из ответа API: текст для человека и машинный код, если они есть в теле. */
async function apiErrorOf(label: string, res: Response): Promise<ApiError> {
  let userMessage: string | undefined;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { message?: unknown; code?: unknown };
    if (typeof body.message === 'string') userMessage = body.message;
    else if (Array.isArray(body.message) && typeof body.message[0] === 'string') {
      userMessage = body.message[0];
    }
    if (typeof body.code === 'string') code = body.code;
  } catch {
    // тело не JSON
  }
  return new ApiError(`${label} responded ${res.status}`, res.status, userMessage, code);
}

async function expectJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    throw await apiErrorOf(label, res);
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
  userAgent?: string,
): Promise<AuthSessionDto> {
  const res = await request('/v1/auth/register', {
    method: 'POST',
    body: input,
    clientIp,
    userAgent,
  });
  return expectJson<AuthSessionDto>(res, 'POST /v1/auth/register');
}

export async function loginUser(
  input: { email: string; password: string },
  clientIp?: string,
  userAgent?: string,
): Promise<AuthSessionDto> {
  const res = await request('/v1/auth/login', { method: 'POST', body: input, clientIp, userAgent });
  return expectJson<AuthSessionDto>(res, 'POST /v1/auth/login');
}

/**
 * revoked — API удалил сессию; invalid — сессия уже недействительна (401);
 * failed — API недоступен или ответил ошибкой: сессия может быть жива, cookie удалять нельзя.
 */
export type LogoutResult = 'revoked' | 'invalid' | 'failed';

export async function logoutSession(token: string): Promise<LogoutResult> {
  try {
    const res = await request('/v1/auth/logout', { method: 'POST', token });
    if (res.status === 204) return 'revoked';
    if (res.status === 401) return 'invalid';
    console.error(`Logout: API responded ${res.status}`);
    return 'failed';
  } catch (error) {
    console.error('Logout: API request failed', error);
    return 'failed';
  }
}

/** null, если сессия недействительна (401). */
export async function getMe(token: string): Promise<UserDto | null> {
  const res = await request('/v1/me', { token });
  if (res.status === 401) return null;
  return expectJson<UserDto>(res, 'GET /v1/me');
}

// --- Заказы текущего заказчика (авторизация и проверка владельца — на стороне API)

export async function listMyJobs(
  token: string,
  page: number,
  limit = 20,
): Promise<Paginated<OwnJobDto>> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  const res = await request(`/v1/me/jobs?${query.toString()}`, { token });
  return expectJson<Paginated<OwnJobDto>>(res, 'GET /v1/me/jobs');
}

/** null, если заказа нет или он принадлежит другому пользователю (API отвечает 404). */
export async function getMyJob(token: string, id: string): Promise<OwnJobDto | null> {
  const res = await request(`/v1/me/jobs/${encodeURIComponent(id)}`, { token });
  if (res.status === 404) return null;
  return expectJson<OwnJobDto>(res, 'GET /v1/me/jobs/:id');
}

export async function createMyJob(
  token: string,
  input: JobInput,
  clientIp?: string,
): Promise<OwnJobDto> {
  const res = await request('/v1/me/jobs', { method: 'POST', body: input, token, clientIp });
  return expectJson<OwnJobDto>(res, 'POST /v1/me/jobs');
}

/** Черновики нового заказа (только владелец). */
export async function listDrafts(token: string): Promise<JobDraftDto[]> {
  const res = await request('/v1/me/drafts', { token });
  return (await expectJson<{ items: JobDraftDto[] }>(res, 'GET /v1/me/drafts')).items;
}

/** null, если черновика нет или он принадлежит другому пользователю (API отвечает 404). */
export async function getDraft(token: string, id: string): Promise<JobDraftDto | null> {
  const res = await request(`/v1/me/drafts/${encodeURIComponent(id)}`, { token });
  if (res.status === 404) return null;
  return expectJson<JobDraftDto>(res, 'GET /v1/me/drafts/:id');
}

export async function saveDraft(
  token: string,
  id: string | null,
  input: JobDraftInput,
  clientIp?: string,
): Promise<JobDraftDto> {
  const res = id
    ? await request(`/v1/me/drafts/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: input,
        token,
        clientIp,
      })
    : await request('/v1/me/drafts', { method: 'POST', body: input, token, clientIp });
  return expectJson<JobDraftDto>(res, id ? 'PUT /v1/me/drafts/:id' : 'POST /v1/me/drafts');
}

export async function deleteDraft(token: string, id: string, clientIp?: string): Promise<void> {
  const res = await request(`/v1/me/drafts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
    clientIp,
  });
  if (res.status !== 204) {
    throw await apiErrorOf('DELETE /v1/me/drafts/:id', res);
  }
}

export async function updateMyJob(
  token: string,
  id: string,
  input: JobUpdateInput,
  clientIp?: string,
): Promise<OwnJobDto> {
  const res = await request(`/v1/me/jobs/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    token,
    clientIp,
  });
  return expectJson<OwnJobDto>(res, 'PATCH /v1/me/jobs/:id');
}

export async function closeMyJob(
  token: string,
  id: string,
  outcome: JobCloseOutcome,
  clientIp?: string,
): Promise<OwnJobDto> {
  const res = await request(`/v1/me/jobs/${encodeURIComponent(id)}/close`, {
    method: 'POST',
    body: { outcome },
    token,
    clientIp,
  });
  return expectJson<OwnJobDto>(res, 'POST /v1/me/jobs/:id/close');
}

// --- Подрядчик: профиль и отклики

export async function getMyProfile(token: string): Promise<ContractorProfileDto> {
  return expectJson<ContractorProfileDto>(
    await request('/v1/me/profile', { token }),
    'GET /v1/me/profile',
  );
}

export async function saveMyProfile(
  token: string,
  input: ContractorProfileInput,
  clientIp?: string,
): Promise<ContractorProfileDto> {
  const res = await request('/v1/me/profile', { method: 'PUT', body: input, token, clientIp });
  return expectJson<ContractorProfileDto>(res, 'PUT /v1/me/profile');
}

export async function placeBid(
  token: string,
  jobId: string,
  input: BidInput,
  clientIp?: string,
): Promise<MyBidDto> {
  const res = await request(`/v1/jobs/${encodeURIComponent(jobId)}/bids`, {
    method: 'POST',
    body: input,
    token,
    clientIp,
  });
  return expectJson<MyBidDto>(res, 'POST /v1/jobs/:id/bids');
}

export async function listMyBids(
  token: string,
  page: number,
  options: { jobId?: string; limit?: number } = {},
): Promise<Paginated<MyBidDto>> {
  const query = new URLSearchParams({ page: String(page), limit: String(options.limit ?? 20) });
  if (options.jobId) query.set('jobId', options.jobId);
  const res = await request(`/v1/me/bids?${query.toString()}`, { token });
  return expectJson<Paginated<MyBidDto>>(res, 'GET /v1/me/bids');
}

export async function withdrawBid(
  token: string,
  bidId: string,
  clientIp?: string,
): Promise<MyBidDto> {
  const res = await request(`/v1/me/bids/${encodeURIComponent(bidId)}/withdraw`, {
    method: 'POST',
    token,
    clientIp,
  });
  return expectJson<MyBidDto>(res, 'POST /v1/me/bids/:id/withdraw');
}

// --- Заказчик: отклики на свой заказ

/** Отклики на свой заказ по страницам (от ранних к поздним), до 50 на страницу. */
export async function listJobBids(
  token: string,
  jobId: string,
  page = 1,
): Promise<Paginated<JobBidDto>> {
  const query = new URLSearchParams({ page: String(page), limit: String(PAGINATION.MAX_LIMIT) });
  const res = await request(`/v1/me/jobs/${encodeURIComponent(jobId)}/bids?${query}`, { token });
  return expectJson<Paginated<JobBidDto>>(res, 'GET /v1/me/jobs/:id/bids');
}

export async function acceptBid(
  token: string,
  jobId: string,
  bidId: string,
  clientIp?: string,
): Promise<JobBidDto> {
  const res = await request(
    `/v1/me/jobs/${encodeURIComponent(jobId)}/bids/${encodeURIComponent(bidId)}/accept`,
    { method: 'POST', token, clientIp },
  );
  return expectJson<JobBidDto>(res, 'POST /v1/me/jobs/:id/bids/:bidId/accept');
}

// --- План работ и этапы (заказчик-владелец и выбранный исполнитель)

const planPath = (jobId: string, rest = '') => `/v1/jobs/${encodeURIComponent(jobId)}${rest}`;

/** null — плана нет для этого пользователя (не сторона сделки или исполнитель не выбран). */
export async function getPlan(token: string, jobId: string): Promise<JobPlanDto | null> {
  const res = await request(planPath(jobId, '/plan'), { token });
  if (res.status === 404) return null;
  return expectJson<JobPlanDto>(res, 'GET /v1/jobs/:id/plan');
}

async function planCall(
  token: string,
  jobId: string,
  rest: string,
  body: object,
  clientIp?: string,
  method: 'POST' | 'PUT' = 'POST',
): Promise<JobPlanDto> {
  const res = await request(planPath(jobId, rest), { method, body, token, clientIp });
  return expectJson<JobPlanDto>(
    res,
    `${method} /v1/jobs/:id${rest.replace(/stages\/[^/]+/, 'stages/:id')}`,
  );
}

export const savePlan = (token: string, jobId: string, input: PlanInput, clientIp?: string) =>
  planCall(token, jobId, '/plan', input, clientIp, 'PUT');

export const setPlanAuthor = (
  token: string,
  jobId: string,
  version: number,
  author: PlanParty,
  clientIp?: string,
) => planCall(token, jobId, '/plan/author', { version, author }, clientIp);

export const proposePlan = (token: string, jobId: string, version: number, clientIp?: string) =>
  planCall(token, jobId, '/plan/propose', { version }, clientIp);

export const approvePlan = (token: string, jobId: string, version: number, clientIp?: string) =>
  planCall(token, jobId, '/plan/approve', { version }, clientIp);

export const returnPlan = (
  token: string,
  jobId: string,
  version: number,
  reason: string,
  clientIp?: string,
) => planCall(token, jobId, '/plan/return', { version, reason }, clientIp);

/** Сдача этапа с комментарием и фото-отчётом (multipart); без фото — JSON, как раньше. */
export async function submitStage(
  token: string,
  jobId: string,
  stageId: string,
  comment: string,
  photos: Blob[] = [],
  clientIp?: string,
): Promise<JobPlanDto> {
  if (photos.length === 0) {
    return planCall(
      token,
      jobId,
      `/stages/${encodeURIComponent(stageId)}/submit`,
      { comment },
      clientIp,
    );
  }
  const formData = new FormData();
  formData.append('comment', comment);
  photos.forEach((photo, index) => formData.append('photos', photo, `photo-${index + 1}`));
  const res = await request(planPath(jobId, `/stages/${encodeURIComponent(stageId)}/submit`), {
    method: 'POST',
    formData,
    token,
    clientIp,
  });
  return expectJson<JobPlanDto>(res, 'POST /v1/jobs/:id/stages/:id/submit');
}

export const acceptStage = (token: string, jobId: string, stageId: string, clientIp?: string) =>
  planCall(token, jobId, `/stages/${encodeURIComponent(stageId)}/accept`, {}, clientIp);

export const reworkStage = (
  token: string,
  jobId: string,
  stageId: string,
  comment: string,
  clientIp?: string,
) => planCall(token, jobId, `/stages/${encodeURIComponent(stageId)}/rework`, { comment }, clientIp);

/** Отказ выбранного исполнителя от заказа: заказ снова открыт. */
export async function quitJob(
  token: string,
  jobId: string,
  reason: string,
  clientIp?: string,
): Promise<void> {
  const res = await request(planPath(jobId, '/quit'), {
    method: 'POST',
    body: { reason },
    token,
    clientIp,
  });
  if (!res.ok) {
    throw await apiErrorOf('POST /v1/jobs/:id/quit', res);
  }
}

// --- Переписка по заказу и фото

/**
 * Переписка сделки: последние сообщения или, с before, более ранние. null — сделки нет
 * (исполнитель не выбран) или нет доступа. Устаревший курсор (400) — последние сообщения.
 */
export async function getMessages(
  token: string,
  jobId: string,
  before?: string,
): Promise<JobMessagesDto | null> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  const res = await request(planPath(jobId, `/messages${query}`), { token });
  if (res.status === 404) return null;
  if (res.status === 400 && before) return getMessages(token, jobId);
  return expectJson<JobMessagesDto>(res, 'GET /v1/jobs/:id/messages');
}

export async function sendMessage(
  token: string,
  jobId: string,
  input: { body: string; requestId: string; photos: Blob[] },
  clientIp?: string,
): Promise<JobMessagesDto> {
  const formData = new FormData();
  formData.append('body', input.body);
  formData.append('requestId', input.requestId);
  input.photos.forEach((photo, index) => formData.append('photos', photo, `photo-${index + 1}`));
  const res = await request(planPath(jobId, '/messages'), {
    method: 'POST',
    formData,
    token,
    clientIp,
  });
  return expectJson<JobMessagesDto>(res, 'POST /v1/jobs/:id/messages');
}

// --- Уведомления в кабинете

/** Страница уведомлений, новые сверху; cursor — nextCursor предыдущей страницы. */
export async function getNotifications(
  token: string,
  cursor?: string,
): Promise<NotificationsPageDto> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await request(`/v1/me/notifications${query}`, { token });
  return expectJson<NotificationsPageDto>(res, 'GET /v1/me/notifications');
}

/** Сколько непрочитанного всего и по заказам (значок в шапке, пометки в списках). */
export async function getNotificationsSummary(token: string): Promise<NotificationsSummaryDto> {
  const res = await request('/v1/me/notifications/summary', { token });
  return expectJson<NotificationsSummaryDto>(res, 'GET /v1/me/notifications/summary');
}

/** Отметить прочитанным: всё, уведомления заказа или перечисленные. Возвращает сводку. */
export async function markNotificationsRead(
  token: string,
  input: MarkNotificationsReadInput,
  clientIp?: string,
): Promise<NotificationsSummaryDto> {
  const res = await request('/v1/me/notifications/read', {
    method: 'POST',
    body: input,
    token,
    clientIp,
  });
  return expectJson<NotificationsSummaryDto>(res, 'POST /v1/me/notifications/read');
}

/** Фото как есть (WebP); null — фото нет или нет доступа. */
export async function fetchJobPhoto(
  token: string,
  jobId: string,
  photoId: string,
  size: PhotoSize,
): Promise<ArrayBuffer | null> {
  const res = await request(
    planPath(jobId, `/photos/${encodeURIComponent(photoId)}?size=${size}`),
    { token },
  );
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok)
    throw new ApiError(`GET /v1/jobs/:id/photos/:id responded ${res.status}`, res.status);
  return res.arrayBuffer();
}

// --- Заявки на закрытое тестирование

/** Публичная отправка заявки с главной; ответ одинаковый для новой заявки и повтора. */
export async function submitLead(input: LeadInput, clientIp?: string): Promise<void> {
  const res = await request('/v1/leads', { method: 'POST', body: input, clientIp });
  await expectJson<{ received: true }>(res, 'POST /v1/leads');
}

export type LeadFilter = 'new' | 'processed';

/** Список заявок для администратора (роль проверяет API). */
export async function listLeads(
  token: string,
  page: number,
  status?: LeadFilter,
): Promise<Paginated<LeadDto>> {
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  if (status) query.set('status', status);
  const res = await request(`/v1/admin/leads?${query.toString()}`, { token });
  return expectJson<Paginated<LeadDto>>(res, 'GET /v1/admin/leads');
}

export async function setLeadProcessed(
  token: string,
  id: string,
  processed: boolean,
  clientIp?: string,
): Promise<LeadDto> {
  const res = await request(`/v1/admin/leads/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { processed },
    token,
    clientIp,
  });
  return expectJson<LeadDto>(res, 'PATCH /v1/admin/leads/:id');
}

// --- Личный кабинет: профиль, оформление, пароль, устройства, фото

export async function updateProfile(
  token: string,
  input: ProfileInput,
  clientIp?: string,
): Promise<UserDto> {
  const res = await request('/v1/me', { method: 'PATCH', body: input, token, clientIp });
  return expectJson<UserDto>(res, 'PATCH /v1/me');
}

export async function updatePreferences(
  token: string,
  input: Partial<UiPreferences>,
  clientIp?: string,
): Promise<UserDto> {
  const res = await request('/v1/me/preferences', {
    method: 'PATCH',
    body: input,
    token,
    clientIp,
  });
  return expectJson<UserDto>(res, 'PATCH /v1/me/preferences');
}

/** Удаление аккаунта по текущему паролю (204). Ошибки — ApiError с кодом API. */
export async function deleteAccount(
  token: string,
  password: string,
  clientIp?: string,
): Promise<void> {
  const res = await request('/v1/me/delete', {
    method: 'POST',
    body: { password },
    token,
    clientIp,
  });
  if (res.status !== 204) throw await apiErrorOf('POST /v1/me/delete', res);
}

/** Выгрузка своих данных: ответ API как есть (файл JSON), чтобы передать его браузеру потоком. */
export async function exportAccount(token: string, clientIp?: string): Promise<Response> {
  return request('/v1/me/export', { token, clientIp });
}

export async function changePassword(
  token: string,
  input: PasswordChangeInput,
  clientIp?: string,
): Promise<void> {
  const res = await request('/v1/me/password', { method: 'POST', body: input, token, clientIp });
  if (res.status !== 204) {
    throw await apiErrorOf('POST /v1/me/password', res);
  }
}

export async function listSessions(token: string): Promise<SessionDto[]> {
  const res = await request('/v1/me/sessions', { token });
  return expectJson<SessionDto[]>(res, 'GET /v1/me/sessions');
}

export async function revokeSession(token: string, id: string, clientIp?: string): Promise<void> {
  const res = await request(`/v1/me/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
    clientIp,
  });
  if (res.status !== 204) {
    throw await apiErrorOf('DELETE /v1/me/sessions/:id', res);
  }
}

export async function revokeOtherSessions(token: string, clientIp?: string): Promise<number> {
  const res = await request('/v1/me/sessions/revoke-others', { method: 'POST', token, clientIp });
  return (await expectJson<{ revoked: number }>(res, 'POST /v1/me/sessions/revoke-others')).revoked;
}

export async function uploadAvatar(token: string, file: Blob, clientIp?: string): Promise<UserDto> {
  const formData = new FormData();
  formData.append('file', file, 'avatar');
  const res = await request('/v1/me/avatar', { method: 'PUT', formData, token, clientIp });
  return expectJson<UserDto>(res, 'PUT /v1/me/avatar');
}

export async function deleteAvatar(token: string, clientIp?: string): Promise<UserDto> {
  const res = await request('/v1/me/avatar', { method: 'DELETE', token, clientIp });
  return expectJson<UserDto>(res, 'DELETE /v1/me/avatar');
}

/** Фото как есть (WebP); null, если фото нет. */
export async function fetchAvatar(token: string): Promise<ArrayBuffer | null> {
  const res = await request('/v1/me/avatar', { token });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(`GET /v1/me/avatar responded ${res.status}`, res.status);
  return res.arrayBuffer();
}

// --- Вход через банк (Сбер ID, Т-Банк ID). Секреты банка только у API, см. lib/bank-login.ts

export type BankId = 'sber' | 'tbank';

export interface BankProvider {
  id: BankId;
  title: string;
}

/** Ошибка входа через банк с кодом API (OAUTH_*) и данными незавершённого входа. */
export class BankLoginError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly userMessage: string | undefined,
    readonly pending?: string,
    readonly bankName?: string | null,
  ) {
    super(`bank login failed: ${status} ${code ?? ''}`);
    this.name = 'BankLoginError';
  }
}

async function bankJson<T>(res: Response, label: string): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let body: { code?: unknown; message?: unknown; pending?: unknown; name?: unknown } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // тело не JSON
  }
  if (res.status >= 500 && res.status !== 502) {
    throw new ApiError(`${label} responded ${res.status}`, res.status);
  }
  throw new BankLoginError(
    res.status,
    typeof body.code === 'string' ? body.code : undefined,
    typeof body.message === 'string' ? body.message : undefined,
    typeof body.pending === 'string' ? body.pending : undefined,
    typeof body.name === 'string' ? body.name : null,
  );
}

/** Банки, вход через которые настроен на сервере; при недоступном API — пустой список. */
export async function getBankProviders(): Promise<BankProvider[]> {
  try {
    const res = await request('/v1/auth/oauth/providers');
    return res.ok ? ((await res.json()) as BankProvider[]) : [];
  } catch {
    return [];
  }
}

export async function bankAuthorizeUrl(
  bank: BankId,
  input: { state: string; nonce: string; codeChallenge: string },
  clientIp?: string,
): Promise<string> {
  const res = await request(`/v1/auth/oauth/${bank}/authorize`, {
    method: 'POST',
    body: input,
    clientIp,
  });
  return (await bankJson<{ url: string }>(res, `POST /v1/auth/oauth/${bank}/authorize`)).url;
}

export interface BankCodeInput {
  code: string;
  codeVerifier: string;
  nonce: string;
}

export async function bankSignIn(
  bank: BankId,
  input: BankCodeInput & { role?: string },
  clientIp?: string,
  userAgent?: string,
): Promise<AuthSessionDto> {
  const res = await request(`/v1/auth/oauth/${bank}/callback`, {
    method: 'POST',
    body: input,
    clientIp,
    userAgent,
  });
  return bankJson<AuthSessionDto>(res, `POST /v1/auth/oauth/${bank}/callback`);
}

export async function bankComplete(
  input: { pending: string; role: string },
  clientIp?: string,
  userAgent?: string,
): Promise<AuthSessionDto> {
  const res = await request('/v1/auth/oauth/complete', {
    method: 'POST',
    body: input,
    clientIp,
    userAgent,
  });
  return bankJson<AuthSessionDto>(res, 'POST /v1/auth/oauth/complete');
}

export async function linkBank(
  token: string,
  bank: BankId,
  input: BankCodeInput,
  clientIp?: string,
): Promise<void> {
  const res = await request(`/v1/me/oauth/${bank}/link`, {
    method: 'POST',
    body: input,
    token,
    clientIp,
  });
  if (res.status !== 204) await bankJson(res, `POST /v1/me/oauth/${bank}/link`);
}

export async function getLinkedBanks(
  token: string,
): Promise<{ provider: BankId; linkedAt: string }[]> {
  const res = await request('/v1/me/oauth', { token });
  return expectJson(res, 'GET /v1/me/oauth');
}

// --- Модерация: жалобы и действия администратора

/** Жалоба на заказ, сообщение или отклик. */
export async function createReport(
  token: string,
  input: ReportInput,
  clientIp?: string,
): Promise<ReportReceivedDto> {
  const res = await request('/v1/reports', { method: 'POST', body: input, token, clientIp });
  return expectJson<ReportReceivedDto>(res, 'POST /v1/reports');
}

export async function listReports(
  token: string,
  status: ReportFilter,
  page: number,
): Promise<Paginated<ReportDto>> {
  const res = await request(`/v1/admin/reports?status=${status}&page=${page}`, { token });
  return expectJson<Paginated<ReportDto>>(res, 'GET /v1/admin/reports');
}

export async function resolveReport(
  token: string,
  id: string,
  input: ResolveReportInput,
  clientIp?: string,
): Promise<ReportDto> {
  const res = await request(`/v1/admin/reports/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    body: input,
    token,
    clientIp,
  });
  return expectJson<ReportDto>(res, 'POST /v1/admin/reports/:id/resolve');
}

/** Скрыть или вернуть заказ, сообщение или отклик. */
export async function setContentHidden(
  token: string,
  kind: 'jobs' | 'messages' | 'bids' | 'reviews',
  id: string,
  input: { hidden: boolean; reason: string },
  clientIp?: string,
): Promise<HiddenStateDto> {
  const res = await request(`/v1/admin/${kind}/${encodeURIComponent(id)}/hidden`, {
    method: 'POST',
    body: input,
    token,
    clientIp,
  });
  return expectJson<HiddenStateDto>(res, `POST /v1/admin/${kind}/:id/hidden`);
}

export async function setUserBlocked(
  token: string,
  id: string,
  input: { blocked: boolean; reason: string },
  clientIp?: string,
): Promise<BlockedStateDto> {
  const res = await request(`/v1/admin/users/${encodeURIComponent(id)}/blocked`, {
    method: 'POST',
    body: input,
    token,
    clientIp,
  });
  return expectJson<BlockedStateDto>(res, 'POST /v1/admin/users/:id/blocked');
}

// --- Аккаунты: новый пароль по ссылке, пользователи для администратора

/** Новый пароль по ссылке; в ответе — новый вход. */
export async function resetPassword(
  input: { token: string; password: string },
  clientIp?: string,
  userAgent?: string,
): Promise<AuthSessionDto> {
  const res = await request('/v1/auth/password-reset', {
    method: 'POST',
    body: input,
    clientIp,
    userAgent,
  });
  return expectJson<AuthSessionDto>(res, 'POST /v1/auth/password-reset');
}

export async function listAdminUsers(
  token: string,
  q: string,
  page: number,
): Promise<Paginated<AdminUserDto>> {
  const query = new URLSearchParams({ page: String(page) });
  if (q) query.set('q', q);
  const res = await request(`/v1/admin/users?${query}`, { token });
  return expectJson<Paginated<AdminUserDto>>(res, 'GET /v1/admin/users');
}

export async function issuePasswordReset(
  token: string,
  userId: string,
  clientIp?: string,
): Promise<PasswordResetLinkDto> {
  const res = await request(`/v1/admin/users/${encodeURIComponent(userId)}/password-reset`, {
    method: 'POST',
    token,
    clientIp,
  });
  return expectJson<PasswordResetLinkDto>(res, 'POST /v1/admin/users/:id/password-reset');
}

// --- Автопроверка контактов и свои жалобы

export async function listFlags(
  token: string,
  status: ReportFilter,
  page: number,
): Promise<Paginated<ContentFlagDto>> {
  const res = await request(`/v1/admin/flags?status=${status}&page=${page}`, { token });
  return expectJson<Paginated<ContentFlagDto>>(res, 'GET /v1/admin/flags');
}

export async function resolveFlag(
  token: string,
  id: string,
  status: 'RESOLVED' | 'DISMISSED',
  clientIp?: string,
): Promise<ContentFlagDto> {
  const res = await request(`/v1/admin/flags/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    body: { status },
    token,
    clientIp,
  });
  return expectJson<ContentFlagDto>(res, 'POST /v1/admin/flags/:id/resolve');
}

export async function listMyReports(token: string, page: number): Promise<Paginated<MyReportDto>> {
  const res = await request(`/v1/reports/mine?page=${page}`, { token });
  return expectJson<Paginated<MyReportDto>>(res, 'GET /v1/reports/mine');
}

export async function markReportsSeen(token: string): Promise<void> {
  const res = await request('/v1/reports/mine/seen', { method: 'POST', token });
  if (res.status !== 204) {
    throw new ApiError(`POST /v1/reports/mine/seen responded ${res.status}`, res.status);
  }
}

// --- Отзывы и карточка мастера

/** null — заказа нет или он чужой (404). */
export async function getJobReview(
  token: string,
  jobId: string,
): Promise<JobReviewStateDto | null> {
  const res = await request(`/v1/me/jobs/${encodeURIComponent(jobId)}/review`, { token });
  if (res.status === 404) return null;
  return expectJson<JobReviewStateDto>(res, 'GET /v1/me/jobs/:id/review');
}

export async function createReview(
  token: string,
  jobId: string,
  input: ReviewInput,
  clientIp?: string,
): Promise<ReviewDto> {
  const res = await request(`/v1/me/jobs/${encodeURIComponent(jobId)}/review`, {
    method: 'POST',
    body: input,
    token,
    clientIp,
  });
  return expectJson<ReviewDto>(res, 'POST /v1/me/jobs/:id/review');
}

/** null — мастера нет (404). */
export async function getContractor(
  publicId: string,
  page: number,
): Promise<PublicContractorDto | null> {
  const res = await request(`/v1/contractors/${encodeURIComponent(publicId)}?page=${page}`);
  if (res.status === 404) return null;
  return expectJson<PublicContractorDto>(res, 'GET /v1/contractors/:publicId');
}

// --- Избранное

export async function listFavorites(token: string, page: number): Promise<Paginated<JobDto>> {
  const res = await request(`/v1/me/favorites?page=${page}`, { token });
  return expectJson<Paginated<JobDto>>(res, 'GET /v1/me/favorites');
}

export async function getFavoriteIds(token: string): Promise<string[]> {
  const res = await request('/v1/me/favorites/ids', { token });
  return (await expectJson<FavoriteIdsDto>(res, 'GET /v1/me/favorites/ids')).jobIds;
}

export async function setFavorite(
  token: string,
  jobId: string,
  favorite: boolean,
  clientIp?: string,
): Promise<FavoriteStateDto> {
  const res = await request(`/v1/me/favorites/${encodeURIComponent(jobId)}`, {
    method: favorite ? 'PUT' : 'DELETE',
    token,
    clientIp,
  });
  return expectJson<FavoriteStateDto>(res, `${favorite ? 'PUT' : 'DELETE'} /v1/me/favorites/:id`);
}

/** Обмен контактами в сделке; null — сделки нет или заказ не виден (404). */
export async function getContacts(
  token: string,
  jobId: string,
): Promise<ContactExchangeDto | null> {
  const res = await request(`/v1/jobs/${encodeURIComponent(jobId)}/contacts`, { token });
  if (res.status === 404) return null;
  return expectJson<ContactExchangeDto>(res, 'GET /v1/jobs/:id/contacts');
}

/** Открыть (shared) или скрыть свои контакты второй стороне сделки. */
export async function setContactsShared(
  token: string,
  jobId: string,
  shared: boolean,
  clientIp?: string,
): Promise<ContactExchangeDto> {
  const res = await request(`/v1/jobs/${encodeURIComponent(jobId)}/contacts`, {
    method: shared ? 'PUT' : 'DELETE',
    token,
    clientIp,
  });
  return expectJson<ContactExchangeDto>(res, `${shared ? 'PUT' : 'DELETE'} /v1/jobs/:id/contacts`);
}

/** Воронка по дням для администратора (только числа). */
export async function getAnalytics(token: string, days: AnalyticsPeriod): Promise<AnalyticsDto> {
  const res = await request(`/v1/admin/analytics?days=${days}`, { token });
  return expectJson<AnalyticsDto>(res, 'GET /v1/admin/analytics');
}

/** Сколько обычно просят мастера по категориям: подсказка к бюджету в форме заказа. */
export async function getPriceEstimates(token: string, city?: string): Promise<PriceEstimatesDto> {
  const query = city ? `?city=${encodeURIComponent(city)}` : '';
  const res = await request(`/v1/price-estimates${query}`, { token });
  return expectJson<PriceEstimatesDto>(res, 'GET /v1/price-estimates');
}
