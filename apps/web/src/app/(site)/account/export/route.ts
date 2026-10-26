import { exportAccount } from '@/lib/api';
import { getClientIp, getSessionToken } from '@/lib/session';

/**
 * «Скачать мои данные» в настройках: файл JSON из API (GET /v1/me/export) передаётся браузеру
 * как есть, с именем файла от API. Только чтение своих данных по cookie сессии; чужая страница
 * может разве что начать скачивание в браузере самого человека, но прочитать файл не может.
 */
export const dynamic = 'force-dynamic';

const SETTINGS = '/account/settings';

const go = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });
const toLogin = () => go(`/login?next=${encodeURIComponent(SETTINGS)}`);

export async function GET(): Promise<Response> {
  const token = await getSessionToken();
  if (!token) return toLogin();
  let res: Response;
  try {
    res = await exportAccount(token, await getClientIp());
  } catch (error) {
    console.error('Account export: API request failed', error);
    return go(`${SETTINGS}?export=failed#data`);
  }
  if (res.status === 401) return toLogin();
  if (res.status === 429) return go(`${SETTINGS}?export=limit#data`);
  if (!res.ok || !res.body) {
    console.error('Account export: API answered', res.status);
    return go(`${SETTINGS}?export=failed#data`);
  }
  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition':
        res.headers.get('content-disposition') ?? 'attachment; filename="garantych-data.json"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
