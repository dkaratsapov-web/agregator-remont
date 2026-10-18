'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Фото профиля или первая буква имени. Фото отдаёт /account/avatar (только своё); главная
 * передаёт уже встроенное мини-фото через src. Если фото не загрузилось, показываем букву
 * вместо значка битой картинки.
 */
export function UserAvatar({
  name,
  avatarVersion,
  src,
  className = 'size-9 text-sm',
  shape = 'rounded-full',
}: {
  name: string;
  avatarVersion: string | null;
  /** Готовый адрес фото (data:), если оно встроено в страницу; иначе — /account/avatar. */
  src?: string | null;
  className?: string;
  /** Скругление: круг в шапке, квадрат со скруглением в штампе аккаунта. */
  shape?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const imageSrc =
    src ?? (avatarVersion ? `/account/avatar?v=${encodeURIComponent(avatarVersion)}` : null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Картинка из серверной разметки может не загрузиться ещё до гидратации, и onError тогда не
  // сработает: проверяем её состояние после монтирования.
  useEffect(() => {
    const img = imgRef.current;
    if (imageSrc && img?.complete && img.naturalWidth === 0) setFailedSrc(imageSrc);
  }, [imageSrc]);
  if (imageSrc && failedSrc !== imageSrc) {
    return (
      // Своё фото, отдаётся с private-кешем: next/image здесь не нужен.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={imgRef}
        src={imageSrc}
        alt=""
        onError={() => setFailedSrc(imageSrc)}
        className={`shrink-0 ${shape} bg-muted-tint object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center ${shape} bg-ink font-semibold text-canvas ${className}`}
    >
      {initial}
    </span>
  );
}
