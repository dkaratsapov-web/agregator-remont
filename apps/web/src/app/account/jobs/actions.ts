'use server';

import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import { ApiError, closeMyJob, createMyJob, updateMyJob } from '@/lib/api';
import { parseJobForm, type JobFormValues } from '@/lib/job-form';
import { getClientIp, getSessionToken } from '@/lib/session';

export interface JobFormState {
  error?: string;
  values?: Partial<JobFormValues>;
}

/** Явно отказываем, если id не похож на идентификатор заказа (тот же формат, что проверяет API). */
const isJobId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Заказ не найден или принадлежит другому пользователю.';
    if (error.status === 403) return 'Создавать и менять заказы могут только заказчики.';
    if (error.status && error.status < 500 && error.userMessage) return error.userMessage;
  }
  console.error('Job action failed', error);
  return 'Сервис временно недоступен. Попробуйте позже.';
}

/** Сессия обязательна; авторизацию (роль, владелец) выполняет API по этой сессии. */
async function requireToken(next: string): Promise<string> {
  const token = await getSessionToken();
  if (!token) redirect(`/login?next=${encodeURIComponent(next)}`);
  return token;
}

function handleUnauthorized(error: unknown, next: string): void {
  if (error instanceof ApiError && error.status === 401) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
}

export async function createJobAction(_prev: JobFormState, form: FormData): Promise<JobFormState> {
  const parsed = parseJobForm(form);
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN, values: parsed.values };
  const token = await requireToken('/account/jobs/new');
  if (!parsed.ok) return { error: parsed.error, values: parsed.values };

  let id: string;
  try {
    id = (await createMyJob(token, parsed.input, await getClientIp())).id;
  } catch (error) {
    handleUnauthorized(error, '/account/jobs/new');
    return { error: messageFor(error), values: parsed.values };
  }
  redirect(`/account/jobs/${id}?created=1`);
}

export async function updateJobAction(
  id: string,
  _prev: JobFormState,
  form: FormData,
): Promise<JobFormState> {
  const parsed = parseJobForm(form);
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN, values: parsed.values };
  if (!isJobId(id)) return { error: 'Заказ не найден.' };
  const path = `/account/jobs/${id}`;
  const token = await requireToken(path);
  if (!parsed.ok) return { error: parsed.error, values: parsed.values };

  try {
    await updateMyJob(token, id, parsed.input, await getClientIp());
  } catch (error) {
    handleUnauthorized(error, path);
    return { error: messageFor(error), values: parsed.values };
  }
  redirect(`${path}?saved=1`);
}

export async function closeJobAction(
  id: string,
  _prev: JobFormState,
  _form: FormData,
): Promise<JobFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!isJobId(id)) return { error: 'Заказ не найден.' };
  const path = `/account/jobs/${id}`;
  const token = await requireToken(path);

  try {
    await closeMyJob(token, id, await getClientIp());
  } catch (error) {
    handleUnauthorized(error, path);
    return { error: messageFor(error) };
  }
  redirect(`${path}?closed=1`);
}
