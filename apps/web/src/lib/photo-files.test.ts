import { describe, expect, it } from 'vitest';
import { photosOf } from './photo-files';

const file = (size: number, type = 'image/jpeg', name = 'a.jpg') =>
  new File([new Uint8Array(size)], name, { type });
const form = (...files: File[]) => {
  const fd = new FormData();
  for (const f of files) fd.append('photos', f);
  return fd;
};

describe('photosOf', () => {
  it('drops the empty file a browser sends for an empty input', () => {
    expect(photosOf(form(new File([], '', { type: 'application/octet-stream' })))).toEqual({
      photos: [],
    });
  });

  it('accepts up to five photos up to 8 MB', () => {
    const result = photosOf(form(file(10), file(20, 'image/png'), file(30, 'image/webp')));
    expect('photos' in result && result.photos).toHaveLength(3);
  });

  it('rejects too many, too large and non-image files', () => {
    expect(photosOf(form(...Array.from({ length: 6 }, () => file(1))))).toEqual({
      error: 'Не больше 5 фото за раз.',
    });
    expect(photosOf(form(file(8 * 1024 * 1024 + 1)))).toEqual({
      error: 'Каждое фото — не больше 8 МБ.',
    });
    expect(photosOf(form(file(10, 'application/pdf', 'a.pdf')))).toEqual({
      error: 'Фото: только JPG, PNG или WebP.',
    });
  });
});
