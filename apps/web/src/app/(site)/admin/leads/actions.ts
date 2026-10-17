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
