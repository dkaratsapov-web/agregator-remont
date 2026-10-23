'use server';

import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  redirectIfUnauthorized,
  requireSessionToken,
} from '@/lib/action-helpers';
import { setLeadProcessed } from '@/lib/api';
import { safeRedirectPath } from '@/lib/redirect';
import { getClientIp } from '@/lib/session';
import { argBool, argString, readFormArgs } from '@/lib/form-args';

export interface LeadToggleState {
  error?: string;
}

/** Отметить заявку обработанной или вернуть в новые. Роль ADMIN проверяет API. */
export async function setLeadProcessedAction(
  id: string,
  processed: boolean,
  returnTo: string,
  _prev: LeadToggleState,
  _form: FormData,
): Promise<LeadToggleState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!isEntityId(id)) return { error: 'Заявка не найдена.' };
  const back = safeRedirectPath(returnTo);
  const token = await requireSessionToken(back);

  try {
    await setLeadProcessed(token, id, processed, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, back);
    return {
      error: apiErrorMessage(error, {
        403: 'Заявки доступны только администратору.',
        404: 'Заявка не найдена.',
      }),
    };
  }
  redirect(back);
}

// --- Формы: параметры скрытым полем args вместо bind (lib/form-args.ts, docs/NO_JS_FORMS.md).

/** args: [leadId, processed, returnTo] */
export async function setLeadProcessedFormAction(prev: LeadToggleState, form: FormData) {
  const [id, processed, returnTo] = readFormArgs(form);
  return setLeadProcessedAction(argString(id), argBool(processed), argString(returnTo), prev, form);
}
