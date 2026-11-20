import { ApiError, getNotificationsSummary } from '@/lib/api';
import { badgeCount } from '@/lib/notifications-badge';
import { getSessionToken } from '@/lib/session';

/** Ответ зависит от cookie сессии: не кэшируется никогда, в том числе 401 и 502. */
const reply = (body: { unread: number | null }, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Число непрочитанных для значка в шапке: значок спрашивает его раз в минуту, пока вкладка открыта. */
export async function GET(): Promise<Response> {
  const token = await getSessionToken();
  if (!token) return reply({ unread: 0 }, 401);
  try {
    const summary = await getNotificationsSummary(token);
    return reply({ unread: badgeCount(summary) });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return reply({ unread: 0 }, 401);
    console.error('Notifications: failed to load summary', error);
    return reply({ unread: null }, 502);
  }
}
