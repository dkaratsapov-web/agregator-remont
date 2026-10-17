'use server';

import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import { apiErrorMessage, redirectIfUnauthorized, requireSessionToken } from '@/lib/action-helpers';
import { saveMyProfile } from '@/lib/api';
import { parseProfileForm, type ProfileFormValues } from '@/lib/bid-form';
import { getClientIp } from '@/lib/session';

export interface ProfileFormState {
  error?: string;
  values?: ProfileFormValues;
}

export async function saveProfileAction(
  _prev: ProfileFormState,
  form: FormData,
): Promise<ProfileFormState> {
  const parsed = parseProfileForm(form);
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN, values: parsed.values };
  const token = await requireSessionToken('/account/profile');
  if (!parsed.ok) return { error: parsed.error, values: parsed.values };

  try {
    await saveMyProfile(token, parsed.input, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, '/account/profile');
    return {
      error: apiErrorMessage(error, { 403: 'Профиль доступен только подрядчикам.' }),
      values: parsed.values,
    };
  }
  redirect('/account/profile?saved=1');
}
