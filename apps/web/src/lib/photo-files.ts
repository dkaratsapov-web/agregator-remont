import { PHOTO_LIMITS } from '@agregator/shared';

const MB = 1024 * 1024;

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Фото из поля формы `photos`: пустой выбор (браузер шлёт пустой файл) отбрасывается;
 * количество, размер и тип проверяются до отправки в API (API перепроверяет по содержимому).
 */
export function photosOf(form: FormData): { photos: File[] } | { error: string } {
  const photos = form
    .getAll('photos')
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (photos.length > PHOTO_LIMITS.PER_UPLOAD) {
    return { error: `Не больше ${PHOTO_LIMITS.PER_UPLOAD} фото за раз.` };
  }
  if (photos.some((photo) => photo.size > PHOTO_LIMITS.INPUT_MAX_BYTES)) {
    return { error: `Каждое фото — не больше ${PHOTO_LIMITS.INPUT_MAX_BYTES / MB} МБ.` };
  }
  if (photos.some((photo) => photo.type && !PHOTO_ACCEPT.split(',').includes(photo.type))) {
    return { error: 'Фото: только JPG, PNG или WebP.' };
  }
  return { photos };
}
