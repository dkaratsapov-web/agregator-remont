import { ACCOUNT_LIMITS } from '@agregator/shared';
import { NextResponse } from 'next/server';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import { apiErrorMessage } from '@/lib/action-helpers';
import { ApiError, deleteAvatar, fetchAvatar, uploadAvatar } from '@/lib/api';
import { readLimitedBody } from '@/lib/read-limited';
import { getClientIp, getSessionToken } from '@/lib/session';

/**
 * Фото профиля текущего пользователя: показ (GET), загрузка (POST multipart) и удаление.
 * Только своё фото: токен из cookie сессии, проверки и перекодирование — в API.
 */

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

const TOO_BIG = 'Файл больше 5 МБ. Выберите фото поменьше.';

/** Фото до 5 МБ плюс запас на заголовки multipart. */
const MAX_REQUEST_BYTES = ACCOUNT_LIMITS.AVATAR_MAX_BYTES + 64 * 1024;

export async function GET(): Promise<Response> {
  const token = await getSessionToken();
  if (!token) return new Response(null, { status: 401 });
  try {
    const image = await fetchAvatar(token);
    if (!image) return new Response(null, { status: 404 });
    // Без долгого кеша: картинка зависит от cookie сессии, и на общем компьютере её не должен
    // увидеть следующий пользователь. Адрес с ?v= всё равно меняется при новой загрузке.
    return new Response(image, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return new Response(null, { status: 401 });
    }
    console.error('Avatar: failed to load', error);
    return new Response(null, { status: 502 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!(await isTrustedOrigin())) return fail(403, FOREIGN_ORIGIN);
  const token = await getSessionToken();
  if (!token) return fail(401, 'Войдите в аккаунт');

  // Лимит на всё тело запроса, читается потоком до разбора multipart: Content-Length может не
  // быть (chunked) или быть неверным. Caddy дополнительно режет тела больше 8 МБ.
  const body = await readLimitedBody(request, MAX_REQUEST_BYTES);
  if (!body) return fail(413, TOO_BIG);

  let file: FormDataEntryValue | null;
  try {
    const parsed = new Response(body, {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    });
    file = (await parsed.formData()).get('file');
  } catch {
    return fail(400, 'Не удалось прочитать файл');
  }
  if (!(file instanceof Blob) || file.size === 0) return fail(400, 'Выберите файл с фото');
  if (file.size > ACCOUNT_LIMITS.AVATAR_MAX_BYTES) return fail(413, TOO_BIG);

  try {
    const user = await uploadAvatar(token, file, await getClientIp());
    return NextResponse.json({ avatarVersion: user.avatarVersion });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : undefined;
    return fail(status && status < 500 ? status : 502, apiErrorMessage(error, { 413: TOO_BIG }));
  }
}

export async function DELETE(): Promise<NextResponse> {
  if (!(await isTrustedOrigin())) return fail(403, FOREIGN_ORIGIN);
  const token = await getSessionToken();
  if (!token) return fail(401, 'Войдите в аккаунт');
  try {
    await deleteAvatar(token, await getClientIp());
    return NextResponse.json({ avatarVersion: null });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : undefined;
    return fail(status && status < 500 ? status : 502, apiErrorMessage(error));
  }
}
