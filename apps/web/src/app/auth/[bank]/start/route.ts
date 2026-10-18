import { bankAuthorizeUrl, BankLoginError } from '@/lib/api';
import { bankErrorCode, isBankId, newBankFlow, saveBankFlow } from '@/lib/bank-login';
import { safeRedirectPath } from '@/lib/redirect';
import { getClientIp, getSessionToken } from '@/lib/session';

/**
 * Начало входа через банк: новый state, nonce и PKCE в короткой cookie, затем переход на
 * страницу банка по адресу от API. ?role= — роль для нового аккаунта (кнопка на регистрации),
 * ?mode=link — привязка банка к аккаунту, в который человек уже вошёл (настройки).
 */
export const dynamic = 'force-dynamic';

const go = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });

export async function GET(request: Request, { params }: { params: Promise<{ bank: string }> }) {
  const { bank } = await params;
  const query = new URL(request.url).searchParams;
  const link = query.get('mode') === 'link';
  const role = query.get('role') ?? undefined;
  const back = link ? '/account/settings' : role ? '/register' : '/login';
  if (!isBankId(bank)) return go(back);
  if (link && !(await getSessionToken())) return go('/login?next=%2Faccount%2Fsettings');

  const next = link ? '/account/settings' : safeRedirectPath(query.get('next'));
  const { flow, codeChallenge } = newBankFlow(bank, link ? 'link' : 'login', next, role);
  try {
    const url = await bankAuthorizeUrl(
      bank,
      { state: flow.state, nonce: flow.nonce, codeChallenge },
      await getClientIp(),
    );
    await saveBankFlow(flow);
    return go(url);
  } catch (error) {
    const code =
      error instanceof BankLoginError ? bankErrorCode(error.code, error.status) : 'failed';
    if (code === 'failed') console.error('Bank login: authorize failed', error);
    return go(`${back}?bank=${bank}&bank_error=${code}`);
  }
}
