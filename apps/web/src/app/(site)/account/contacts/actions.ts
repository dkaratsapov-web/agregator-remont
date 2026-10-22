'use server';

import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  redirectIfUnauthorized,
  requireSessionToken,
} from '@/lib/action-helpers';
import { setContactsShared } from '@/lib/api';
import { argBool, argString, readFormArgs } from '@/lib/form-args';
import { safeRedirectPath } from '@/lib/redirect';
import { getClientIp } from '@/lib/session';

export interface ContactsFormState {
  error?: string;
}

/** Открыть свои контакты второй стороне сделки или скрыть; args: [jobId, shared, returnTo]. */
export async function contactsFormAction(
  _prev: ContactsFormState,
  form: FormData,
): Promise<ContactsFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  const [rawId, rawShared, rawReturn] = readFormArgs(form);
  const jobId = argString(rawId);
  if (!isEntityId(jobId)) return { error: 'Заказ не найден: обновите страницу.' };
  const back = safeRedirectPath(argString(rawReturn));
  const token = await requireSessionToken(back);
  try {
    await setContactsShared(token, jobId, argBool(rawShared), await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, back);
    return {
      error: apiErrorMessage(error, { 404: 'Сделки по заказу нет: исполнитель не выбран.' }),
    };
  }
  redirect(`${back}#contacts`);
}
