import { PHOTO_LIMITS } from '@agregator/shared';
import { FilesInterceptor } from '@nestjs/platform-express';

/**
 * Фото в multipart-поле photos: до 5 файлов по 8 МБ, в памяти; формат проверяется по
 * содержимому при перекодировании. Без фото запрос может быть и JSON.
 */
export const photoUpload = () =>
  FilesInterceptor('photos', PHOTO_LIMITS.PER_UPLOAD, {
    limits: {
      fileSize: PHOTO_LIMITS.INPUT_MAX_BYTES,
      files: PHOTO_LIMITS.PER_UPLOAD,
      fields: 4,
      parts: PHOTO_LIMITS.PER_UPLOAD + 4,
    },
  });
