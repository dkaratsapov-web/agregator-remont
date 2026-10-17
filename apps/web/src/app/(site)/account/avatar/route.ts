import { ACCOUNT_LIMITS } from '@agregator/shared';
import { NextResponse } from 'next/server';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import { apiErrorMessage } from '@/lib/action-helpers';
import { ApiError, deleteAvatar, fetchAvatar, uploadAvatar } from '@/lib/api';
import { getClientIp, getSessionToken } from '@/lib/session';

/**
 * Фото профиля текущего пользователя: показ (GET), загрузка (POST multipart) и удаление.
 * Только своё фото: токен из cookie сессии, проверки и перекодирование — в API.
 */

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function GET(request: Request): Promise<Response> {
  const token = await getSessionToken();
  if (!token) return new Response(null, { status: 401 });
  try {
    const image = await fetchAvatar(token);
    if (!image) return new Response(null, { status: 404 });
    // Адрес с ?v=<версия> меняется при каждой загрузке, поэтому такой ответ можно кешировать.
    const versioned = new URL(request.url).searchParams.has('v');
    return new Response(image, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': versioned ? 'private, max-age=31536000, immutable' : 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401)
      return new Response(null, { status: 401 });
    console.error('Avatar: failed to load', error);
    return new Response(null, { status: 502 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!(await isTrustedOrigin())) return fail(403, FOREIGN_ORIGIN);
  const token = await getSessionToken();
  if (!token) return fail(401, 'Войдите в аккаунт');
  if (
    Number(request.headers.get('content-length') ?? 0) >
    ACCOUNT_LIMITS.AVATAR_MAX_BYTES + 64_000
  ) {
    return fail(413, 'Файл больше 5 МБ. Выберите фото поменьше.');
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return fail(400, 'Не удалось прочитать файл');
  }
  if (!(file instanceof Blob) || file.size === 0) return fail(400, 'Выберите файл с фото');
  if (file.size > ACCOUNT_LIMITS.AVATAR_MAX_BYTES) {
    return fail(413, 'Файл больше 5 МБ. Выберите фото поменьше.');
  }
  try {
    const user = await uploadAvatar(token, file, await getClientIp());
    return NextResponse.json({ avatarVersion: user.avatarVersion });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : undefined;
    return fail(
      status && status < 500 ? status : 502,
      apiErrorMessage(error, { 413: 'Файл больше 5 МБ. Выберите фото поменьше.' }),
    );
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
