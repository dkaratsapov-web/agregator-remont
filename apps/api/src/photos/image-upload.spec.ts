import { BadRequestException } from '@nestjs/common';
import { deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { processAvatar } from '../users/avatar';
import { processPhoto } from './photo-processing';

/**
 * Загрузка картинок (аудит 23.10.2026, матрица безопасности): формат — по содержимому, а не по
 * имени и Content-Type; «бомба» с огромным разрешением отклоняется до распаковки; метаданные
 * (EXIF: геолокация, модель телефона) не сохраняются. Общие проверки для фото к сообщениям и
 * сдаче этапа (processPhoto) и фото профиля (processAvatar).
 */

/** Таблица CRC-32 для блоков PNG. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/**
 * Правильный PNG side×side серых пикселей из нулей: сжатый — десятки килобайт, распакованный —
 * side² байт памяти (и больше при перекодировании).
 */
function pngBomb(side: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr.set([8, 0, 0, 0, 0], 8); // 8 бит, оттенки серого
  const rows = deflateSync(Buffer.alloc((side + 1) * side), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', rows),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const real = (format: 'jpeg' | 'png' | 'webp' | 'gif') =>
  sharp({ create: { width: 40, height: 30, channels: 3, background: '#c2410c' } })
    .toFormat(format)
    .toBuffer();

// 7100² ≈ 50,4 Мп: больше пределов обоих обработчиков (50 и 40 Мп).
const BOMB_SIDE = 7_100;
const bomb = pngBomb(BOMB_SIDE);

describe.each([
  ['processPhoto', (b: Buffer) => processPhoto(b).then((r) => r.full)],
  ['processAvatar', processAvatar],
] as const)('%s', (_name, process) => {
  it.each(['jpeg', 'png', 'webp'] as const)('accepts a real %s and outputs WebP', async (f) => {
    const out = await process(await real(f));
    expect((await sharp(out).metadata()).format).toBe('webp');
  });

  it.each([
    ['PHP disguised as an image', Buffer.from('<?php system($_GET["c"]); ?>')],
    ['HTML', Buffer.from('<!doctype html><script>alert(1)</script>')],
    [
      'SVG with a script',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    ],
    ['empty file', Buffer.alloc(0)],
    ['truncated JPEG header', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])],
  ])('rejects %s (400)', async (_n, input) => {
    await expect(process(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects GIF: the format is checked by content, not by name', async () => {
    await expect(process(await real('gif'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a pixel bomb: a valid 50.4 Mpx PNG of ~50 KB, over the input limit', async () => {
    // Без нашего лимита sharp его бы обработал: его собственный предел — 268 Мп.
    expect((await sharp(bomb).metadata()).width).toBe(BOMB_SIDE);
    expect(bomb.length).toBeLessThan(200_000);
    await expect(process(bomb)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('drops EXIF metadata (location, phone model)', async () => {
    const withExif = await sharp(await real('jpeg'))
      .withExif({ IFD0: { Make: 'PhoneMaker', Model: 'Secret 1' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await process(withExif);
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(out.includes(Buffer.from('PhoneMaker'))).toBe(false);
  });
});
