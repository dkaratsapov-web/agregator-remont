import { ApiError, getNotificationsSummary } from '@/lib/api';
import { getSessionToken } from '@/lib/session';

/** Число непрочитанных для значка в шапке: значок спрашивает его раз в минуту, пока вкладка открыта. */
export async function GET(): Promise<Response> {
  const token = await getSessionToken();
  if (!token) return Response.json({ unread: 0 }, { status: 401 });
  try {
    const summary = await getNotificationsSummary(token);
    return Response.json({ unread: summary.unread }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return Response.json({ unread: 0 }, { status: 401 });
    }
    console.error('Notifications: failed to load summary', error);
    return Response.json({ unread: null }, { status: 502 });
  }
}
