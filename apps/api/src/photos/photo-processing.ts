import { PHOTO_LIMITS } from '@agregator/shared';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
/** Защита от «бомб» с огромным разрешением: не больше 50 Мп (камера телефона — до 48 Мп). */
const MAX_INPUT_PIXELS = 50_000_000;

const INVALID = 'Фото: только JPG, PNG или WebP';

export interface ProcessedPhoto {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

/**
 * Перекодирует фото к сообщению или сдаче этапа, как фото профиля (users/avatar.ts): формат —
 * по содержимому, поворот по EXIF применяется, затем WebP без метаданных (геолокация и модель
 * телефона не сохраняются). Полное — до 2000 px по большей стороне, миниатюра — до 480 px;
 * маленькие фото не увеличиваются.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  let format: string | undefined;
  try {
    ({ format } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata());
  } catch {
    throw new BadRequestException(INVALID);
  }
  if (!format || !ALLOWED_FORMATS.has(format)) throw new BadRequestException(INVALID);
  const resize = (side: number) =>
    sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', pages: 1 })
      .rotate()
      .resize(side, side, { fit: 'inside', withoutEnlargement: true });
  try {
    const full = await resize(PHOTO_LIMITS.FULL_MAX_SIDE)
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await resize(PHOTO_LIMITS.THUMB_MAX_SIDE).webp({ quality: 72 }).toBuffer();
    return { full: full.data, thumb, width: full.info.width, height: full.info.height };
  } catch {
    throw new BadRequestException('Не удалось обработать фото. Попробуйте другой файл.');
  }
}
