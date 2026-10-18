import { ACCOUNT_LIMITS } from '@agregator/shared';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
/** Защита от «бомб» с огромным разрешением: не больше 40 Мп. */
const MAX_INPUT_PIXELS = 40_000_000;

const INVALID = 'Загрузите фото в формате JPG, PNG или WebP';

/**
 * Перекодирует фото профиля: формат определяется по содержимому (не по расширению и
 * Content-Type), поворот по EXIF применяется, затем квадрат 512×512 в WebP. Метаданные
 * (EXIF с геолокацией, модель телефона) в результат не попадают: sharp их не копирует.
 */
export async function processAvatar(input: Buffer): Promise<Buffer> {
  let format: string | undefined;
  try {
    ({ format } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata());
  } catch {
    throw new BadRequestException(INVALID);
  }
  if (!format || !ALLOWED_FORMATS.has(format)) throw new BadRequestException(INVALID);
  try {
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', pages: 1 })
      .rotate()
      .resize(ACCOUNT_LIMITS.AVATAR_SIZE, ACCOUNT_LIMITS.AVATAR_SIZE, {
        fit: 'cover',
        position: 'attention',
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new BadRequestException('Не удалось обработать фото. Попробуйте другой файл.');
  }
}
