import type { PhotoDto } from '@agregator/shared';

export const photoUrl = (jobId: string, photoId: string, size: 'thumb' | 'full') =>
  `/account/photos/${jobId}/${photoId}${size === 'thumb' ? '?size=thumb' : ''}`;

/**
 * Миниатюры фото; нажатие открывает полное фото в новой вкладке (просмотр без JS). Размеры
 * известны заранее — место под картинку резервируется, страница не прыгает при загрузке.
 */
export function PhotoGrid({
  jobId,
  photos,
  label,
}: {
  jobId: string;
  photos: PhotoDto[];
  /** Для чтения с экрана: «Фото к этапу …», «Фото к сообщению». */
  label: string;
}) {
  if (photos.length === 0) return null;
  return (
    <ul aria-label={label} className="mt-2 flex flex-wrap gap-2">
      {photos.map((photo, index) => (
        <li key={photo.id}>
          <a
            href={photoUrl(jobId, photo.id, 'full')}
            target="_blank"
            rel="noopener"
            className="block overflow-hidden rounded-[10px] border border-line bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {/* Фото отдаёт кабинет по сессии: next/image с оптимизацией здесь не подходит. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl(jobId, photo.id, 'thumb')}
              alt={`Фото ${index + 1} из ${photos.length}`}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              decoding="async"
              className="h-24 w-auto max-w-[10rem] object-cover sm:h-28"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
