import 'server-only';
import sharp from 'sharp';
import { fetchAvatar } from './api';
import { getSessionToken } from './session';

/** Сторона мини-фото: в шапке аватар 36–44 px, запас на экраны с плотностью 2–3×. */
const THUMB_SIZE = 96;

/**
 * Фото профиля, уменьшенное и встроенное прямо в страницу (data:). Нужно главной: она открыта
 * без пароля тестировщика, и отдельный запрос картинки к закрытому /account/avatar вызвал бы окно
 * ввода пароля. Страница с cookie сессии не кешируется, так что фото видит только его владелец.
 * null — фото нет или его не удалось получить: тогда в шапке первая буква имени.
 */
export async function getAvatarThumb(): Promise<string | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const image = await fetchAvatar(token);
    if (!image) return null;
    const thumb = await sharp(Buffer.from(image))
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();
    return `data:image/webp;base64,${thumb.toString('base64')}`;
  } catch (error) {
    console.error('Avatar: failed to build thumbnail', error);
    return null;
  }
}
