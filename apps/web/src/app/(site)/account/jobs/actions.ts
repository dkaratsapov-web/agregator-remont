'use server';

import { JOB_CLOSE_OUTCOMES, type JobCloseOutcome } from '@agregator/shared';
import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  isUnauthorized,
  redirectIfUnauthorized,
  requireSessionToken,
  sessionExpired,
} from '@/lib/action-helpers';
import {
  acceptBid,
  ApiError,
  closeMyJob,
  createMyJob,
  deleteDraft,
  saveDraft,
  updateMyJob,
} from '@/lib/api';
import {
  draftIdFrom,
  parseDraftForm,
  parseJobForm,
  versionFrom,
  type JobFormIssue,
  type JobFormValues,
} from '@/lib/job-form';
import { getClientIp, getSessionToken } from '@/lib/session';

export interface JobFormState {
  error?: string;
  /** Сессия закончилась: ссылка на вход в новой вкладке, введённое остаётся в форме. */
  login?: string;
  /** Ошибки по полям формы и вопросам анкеты (подсвечиваются у полей). */
  issues?: JobFormIssue[];
  /** Введённые значения, включая ответы анкеты (JSON), чтобы не потерять их при ошибке. */
  values?: Partial<JobFormValues>;
  /** Черновик уже опубликован (другая вкладка, повтор запроса): форма забывает его id. */
  draftReset?: boolean;
}

const JOB_ERRORS = {
  404: 'Заказ не найден или принадлежит другому пользователю.',
  403: 'Создавать и менять заказы могут только заказчики.',
};

export async function createJobAction(_prev: JobFormState, form: FormData): Promise<JobFormState> {
  const parsed = parseJobForm(form);
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN, values: parsed.values };
  if (!parsed.ok) return { error: parsed.error, issues: parsed.issues, values: parsed.values };
  const back = newJobPath(parsed.input.draftId);
  const token = await getSessionToken();
  if (!token) return { ...sessionExpired(back), values: parsed.values };

  let id: string;
  try {
    id = (await createMyJob(token, parsed.input, await getClientIp())).id;
  } catch (error) {
    if (isUnauthorized(error)) return { ...sessionExpired(back), values: parsed.values };
    // 409 — заказ из этого черновика уже опубликован: второй не создаётся (сообщение от API).
    const draftReset = error instanceof ApiError && error.status === 409 && !!parsed.input.draftId;
    return { error: apiErrorMessage(error, JOB_ERRORS), values: parsed.values, draftReset };
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
  if (!parsed.ok) return { error: parsed.error, issues: parsed.issues, values: parsed.values };
  const token = await getSessionToken();
  if (!token) return { ...sessionExpired(path), values: parsed.values };

  const version = versionFrom(form);
  try {
    await updateMyJob(
      token,
      id,
      { ...parsed.input, ...(version ? { expectedUpdatedAt: version } : {}) },
      await getClientIp(),
    );
  } catch (error) {
    if (isUnauthorized(error)) return { ...sessionExpired(path), values: parsed.values };
    // 409: заказ изменён в другой вкладке (текст от API) или уже не открыт; правка не применена.
    return { error: apiErrorMessage(error, JOB_ERRORS), values: parsed.values };
  }
  redirect(`${path}?saved=1`);
}

/** Страница нового заказа; с черновиком — тот же черновик после входа. */
const newJobPath = (draftId?: string) =>
  draftId ? `/account/jobs/new?draft=${encodeURIComponent(draftId)}` : '/account/jobs/new';

const isCloseOutcome = (value: unknown): value is JobCloseOutcome =>
  typeof value === 'string' && (JOB_CLOSE_OUTCOMES as readonly string[]).includes(value);

export async function closeJobAction(
  id: string,
  _prev: JobFormState,
  form: FormData,
): Promise<JobFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!isEntityId(id)) return { error: 'Заказ не найден.' };
  const outcome = form.get('outcome');
  if (!isCloseOutcome(outcome)) return { error: 'Выберите, чем закончился заказ.' };
  const path = `/account/jobs/${id}`;
  const token = await requireSessionToken(path);

  try {
    await closeMyJob(token, id, outcome, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, path);
    return { error: apiErrorMessage(error, JOB_ERRORS) };
  }
  redirect(`${path}?closed=${outcome === 'COMPLETED' ? 'done' : 'cancelled'}`);
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

export type DraftSaveResult =
  | { ok: true; draftId: string; savedAt: string }
  /**
   * reset: черновика больше нет (опубликован или удалён), форма забывает его id.
   * conflict: черновик изменён в другой вкладке; форма не перезаписывает его без согласия.
   * login: сессия закончилась, ссылка на вход в новой вкладке.
   */
  | { ok: false; error: string; reset?: boolean; conflict?: boolean; login?: string };

/**
 * Сохранение черновика из формы нового заказа (кнопка и автосохранение). Вызывается из
 * клиента, поэтому без redirect: при потерянной сессии форма показывает ошибку и не теряет
 * введённое.
 */
export async function saveDraftAction(form: FormData): Promise<DraftSaveResult> {
  if (!(await isTrustedOrigin())) return { ok: false, error: FOREIGN_ORIGIN };
  const id = draftIdFrom(form);
  const token = await getSessionToken();
  if (!token) return { ok: false, ...draftSessionExpired(id) };
  const input = parseDraftForm(form);
  // Версия из последнего сохранения этой формы: черновик, изменённый в другой вкладке, не
  // перезаписывается молча (MVP-6). Без версии (форма выбрала «оставить мою») — перезапись.
  const version = id ? versionFrom(form) : null;
  const clientIp = await getClientIp();
  try {
    const draft = await saveDraft(
      token,
      id,
      version ? { ...input, expectedUpdatedAt: version } : input,
      clientIp,
    );
    return { ok: true, draftId: draft.id, savedAt: draft.updatedAt };
  } catch (error) {
    // Не создаём черновик заново: он мог быть только что опубликован, и запоздавшее
    // сохранение не должно его воскресить. Следующее сохранение из формы создаст новый.
    if (id && error instanceof ApiError && error.status === 404) {
      return {
        ok: false,
        reset: true,
        error: 'Черновик уже опубликован или удалён. Следующее сохранение создаст новый.',
      };
    }
    if (isUnauthorized(error)) return { ok: false, ...draftSessionExpired(id) };
    if (id && error instanceof ApiError && error.status === 409) {
      return {
        ok: false,
        conflict: true,
        error: 'Черновик изменён в другой вкладке. Это сохранение его не перезаписало.',
      };
    }
    return {
      ok: false,
      error: apiErrorMessage(error, { 403: 'Черновики доступны только заказчикам.' }),
    };
  }
}

const draftSessionExpired = (id: string | null) => ({
  error:
    'Сессия закончилась, черновик не сохранён. Войдите в новой вкладке: введённое здесь на месте.',
  login: sessionExpired(newJobPath(id ?? undefined)).login,
});

export async function deleteDraftAction(id: string): Promise<void> {
  if (!(await isTrustedOrigin()) || !isEntityId(id)) redirect('/account/jobs');
  const token = await requireSessionToken('/account/jobs');
  try {
    await deleteDraft(token, id, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, '/account/jobs');
    // Уже удалён (например, в другой вкладке): список всё равно обновится.
    if (!(error instanceof ApiError && error.status === 404)) {
      console.error('Draft: failed to delete', error);
      redirect('/account/jobs?draftError=1');
    }
  }
  redirect('/account/jobs?draftDeleted=1');
}
