'use server';

import { redirect } from 'next/navigation';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import {
  apiErrorMessage,
  isEntityId,
  redirectIfUnauthorized,
  requireSessionToken,
} from '@/lib/action-helpers';
import { placeBid, withdrawBid } from '@/lib/api';
import { parseBidForm, type BidFormValues, type FieldErrors } from '@/lib/bid-form';
import { safeRedirectPath } from '@/lib/redirect';
import { getClientIp } from '@/lib/session';
import { argString, readFormArgs } from '@/lib/form-args';

export interface BidFormState {
  error?: string;
  /** Ошибки у полей формы. */
  fields?: FieldErrors<keyof BidFormValues>;
  values?: Partial<BidFormValues>;
}

const BID_ERRORS = { 403: 'Откликаться на заказы могут только подрядчики.' };

export async function placeBidAction(
  jobId: string,
  _prev: BidFormState,
  form: FormData,
): Promise<BidFormState> {
  const parsed = parseBidForm(form);
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN, values: parsed.values };
  if (!isEntityId(jobId)) return { error: 'Заказ не найден.' };
  const path = `/jobs/${jobId}`;
  const token = await requireSessionToken(path);
  if (!parsed.ok) return { error: parsed.error, fields: parsed.fields, values: parsed.values };

  try {
    await placeBid(token, jobId, parsed.input, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, path);
    return { error: apiErrorMessage(error, BID_ERRORS), values: parsed.values };
  }
  redirect(`${path}?bid=sent`);
}

export async function withdrawBidAction(
  bidId: string,
  returnTo: string,
  _prev: BidFormState,
  _form: FormData,
): Promise<BidFormState> {
  if (!(await isTrustedOrigin())) return { error: FOREIGN_ORIGIN };
  if (!isEntityId(bidId)) return { error: 'Отклик не найден.' };
  const back = safeRedirectPath(returnTo);
  const token = await requireSessionToken(back);

  try {
    await withdrawBid(token, bidId, await getClientIp());
  } catch (error) {
    redirectIfUnauthorized(error, back);
    return { error: apiErrorMessage(error, { 404: 'Отклик не найден.', ...BID_ERRORS }) };
  }
  redirect(`${back}${back.includes('?') ? '&' : '?'}withdrawn=1`);
}

// --- Формы: параметры скрытым полем args вместо bind (lib/form-args.ts, docs/NO_JS_FORMS.md).

/** args: [jobId] */
export async function placeBidFormAction(prev: BidFormState, form: FormData) {
  const [jobId] = readFormArgs(form);
  return placeBidAction(argString(jobId), prev, form);
}

/** args: [bidId, returnTo] */
export async function withdrawBidFormAction(prev: BidFormState, form: FormData) {
  const [bidId, returnTo] = readFormArgs(form);
  return withdrawBidAction(argString(bidId), argString(returnTo), prev, form);
}
