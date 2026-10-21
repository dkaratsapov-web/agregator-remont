'use server';

import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  redirectIfUnauthorized,
  requireSessionToken,
} from '@/lib/action-helpers';
import { setFavorite } from '@/lib/api';
import { argBool, argString, readFormArgs } from '@/lib/form-args';
import { safeRedirectPath } from '@/lib/redirect';
import { getClientIp } from '@/lib/session';

export interface FavoriteState {
  error?: string;
}

/** Добавить заказ в избранное или убрать; args: [jobId, favorite, returnTo]. */
export async function favoriteFormAction(
  _prev: FavoriteState,
  form: FormData,
): Promise<FavoriteState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  const [rawId, rawFavorite, rawReturn] = readFormArgs(form);
  const jobId = argString(rawId);
  if (!isEntityId(jobId)) return { error: 'Заказ не найден: обновите страницу.' };
  const back = safeRedirectPath(argString(rawReturn));
  const token = await requireSessionToken(back);
  try {
    await setFavorite(token, jobId, argBool(rawFavorite), await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, back);
    return { error: apiErrorMessage(error, { 404: 'Заказ не найден или скрыт.' }) };
  }
  redirect(back);
}
