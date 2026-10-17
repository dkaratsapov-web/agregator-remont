'use server';

import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  redirectIfUnauthorized,
  requireSessionToken,
} from '@/lib/action-helpers';
import { acceptBid, closeMyJob, createMyJob, updateMyJob } from '@/lib/api';
import { parseJobForm, type JobFormIssue, type JobFormValues } from '@/lib/job-form';
import { getClientIp } from '@/lib/session';

export interface JobFormState {
  error?: string;
  /** Ошибки по полям формы и вопросам анкеты (подсвечиваются у полей). */
  issues?: JobFormIssue[];
  /** Введённые значения, включая ответы анкеты (JSON), чтобы не потерять их при ошибке. */
  values?: Partial<JobFormValues>;
}

const JOB_ERRORS = {
  404: 'Заказ не найден или принадлежит другому пользователю.',
  403: 'Создавать и менять заказы могут только заказчики.',
};

export async function createJobAction(_prev: JobFormState, form: FormData): Promise<JobFormState> {
  const parsed = parseJobForm(form);
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN, values: parsed.values };
  const token = await requireSessionToken('/account/jobs/new');
  if (!parsed.ok) return { error: parsed.error, issues: parsed.issues, values: parsed.values };

  let id: string;
  try {
    id = (await createMyJob(token, parsed.input, await getClientIp())).id;
  } catch (error) {
    redirectIfUnauthorized(error, '/account/jobs/new');
    return { error: apiErrorMessage(error, JOB_ERRORS), values: parsed.values };
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
  if (!isEntityId(id)) return { error: 'Заказ не найден.' };
  const path = `/account/jobs/${id}`;
  const token = await requireSessionToken(path);
  if (!parsed.ok) return { error: parsed.error, issues: parsed.issues, values: parsed.values };

  try {
    await updateMyJob(token, id, parsed.input, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, path);
    return { error: apiErrorMessage(error, JOB_ERRORS), values: parsed.values };
  }
  redirect(`${path}?saved=1`);
}

export async function closeJobAction(
  id: string,
  _prev: JobFormState,
  _form: FormData,
): Promise<JobFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!isEntityId(id)) return { error: 'Заказ не найден.' };
  const path = `/account/jobs/${id}`;
  const token = await requireSessionToken(path);

  try {
    await closeMyJob(token, id, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, path);
    return { error: apiErrorMessage(error, JOB_ERRORS) };
  }
  redirect(`${path}?closed=1`);
}

export async function acceptBidAction(
  jobId: string,
  bidId: string,
  _prev: JobFormState,
  _form: FormData,
): Promise<JobFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!isEntityId(jobId) || !isEntityId(bidId)) return { error: 'Отклик не найден.' };
  const path = `/account/jobs/${jobId}`;
  const token = await requireSessionToken(path);

  try {
    await acceptBid(token, jobId, bidId, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, path);
    return { error: apiErrorMessage(error, { 404: 'Отклик не найден.' }) };
  }
  redirect(`${path}?accepted=1`);
}
