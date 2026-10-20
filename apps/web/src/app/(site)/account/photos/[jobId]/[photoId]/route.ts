import { PHOTO_SIZES, type PhotoSize } from '@agregator/shared';
import { isEntityId } from '@/lib/action-helpers';
import { ApiError, fetchJobPhoto } from '@/lib/api';
import { getSessionToken } from '@/lib/session';

/**
 * Фото к сообщению или сдаче этапа: токен из cookie сессии, доступ проверяет API (стороны
 * сделки и администратор, остальным 404). Содержимое по адресу не меняется, но адрес открывает
 * только участник — поэтому кеш только в браузере (private) и не дольше суток.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string; photoId: string }> },
): Promise<Response> {
  const { jobId, photoId } = await params;
  const requested = new URL(request.url).searchParams.get('size');
  const size: PhotoSize = PHOTO_SIZES.includes(requested as PhotoSize)
    ? (requested as PhotoSize)
    : 'full';
  if (!isEntityId(jobId) || !isEntityId(photoId)) return new Response(null, { status: 404 });
  const token = await getSessionToken();
  if (!token) return new Response(null, { status: 401 });
  try {
    const image = await fetchJobPhoto(token, jobId, photoId, size);
    if (!image) return new Response(null, { status: 404 });
    return new Response(image, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return new Response(null, { status: 401 });
    }
    console.error('Photo: failed to load', error);
    return new Response(null, { status: 502 });
  }
}
