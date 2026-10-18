import { ApiError, bankSignIn, BankLoginError, linkBank } from '@/lib/api';
import {
  bankErrorCode,
  isBankId,
  saveBankPending,
  stateMatches,
  takeBankFlow,
} from '@/lib/bank-login';
import { getClientIp, getSessionToken, getUserAgent, setSessionCookie } from '@/lib/session';

/**
 * Возврат из банка. Код принимается, только если state совпал с сохранённым в cookie этого
 * браузера при старте: чужая ссылка с кодом (подмена входа) не сработает. Cookie входа
 * удаляется сразу, повторить тот же возврат нельзя.
 */
export const dynamic = 'force-dynamic';

const go = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });

export async function GET(request: Request, { params }: { params: Promise<{ bank: string }> }) {
  const { bank } = await params;
  const query = new URL(request.url).searchParams;
  const flow = await takeBankFlow();
  const back = flow?.mode === 'link' ? '/account/settings' : flow?.role ? '/register' : '/login';
  if (!isBankId(bank)) return go(back);
  const fail = (code: string) => go(`${back}?bank=${bank}&bank_error=${code}`);

  // Человек отказался в банке или банк вернул ошибку.
  if (query.get('error'))
    return fail(query.get('error') === 'access_denied' ? 'cancelled' : 'failed');
  const code = query.get('code');
  if (!flow || flow.bank !== bank || !code || !stateMatches(flow.state, query.get('state'))) {
    return fail('expired');
  }
  const input = { code, codeVerifier: flow.verifier, nonce: flow.nonce };

  try {
    if (flow.mode === 'link') {
      const token = await getSessionToken();
      if (!token) return go('/login?next=%2Faccount%2Fsettings');
      await linkBank(token, bank, input, await getClientIp());
      return go(`/account/settings?bank=${bank}&bank_linked=1`);
    }
    const session = await bankSignIn(
      bank,
      { ...input, ...(flow.role ? { role: flow.role } : {}) },
      await getClientIp(),
      await getUserAgent(),
    );
    await setSessionCookie(session.token, session.expiresAt);
    return go(flow.next);
  } catch (error) {
    if (error instanceof BankLoginError) {
      if (error.code === 'OAUTH_NEED_ROLE' && error.pending) {
        await saveBankPending(error.pending);
        return go(`/register?bank=${bank}&bank_step=role`);
      }
      return fail(bankErrorCode(error.code, error.status));
    }
    if (!(error instanceof ApiError)) throw error;
    console.error('Bank login: callback failed', error);
    return fail('failed');
  }
}
