import { NextResponse, type NextRequest } from 'next/server';
import { clearResetToken, isResetToken, saveResetToken } from '@/lib/password-reset';

/** Ссылка из сообщения администратора: токен — в cookie, человек — на форму без токена в адресе. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (isResetToken(token)) await saveResetToken(token);
  else await clearResetToken();
  const response = NextResponse.redirect(new URL('/reset', request.url), 303);
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
