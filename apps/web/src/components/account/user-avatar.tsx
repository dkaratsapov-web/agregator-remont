'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Фото профиля или первая буква имени. Фото отдаёт /account/avatar (только своё). Если фото не
 * загрузилось (например, главная открыта без пароля тестировщика, а адрес фото в закрытой
 * части), показываем букву вместо значка битой картинки.
 */
export function UserAvatar({
  name,
  avatarVersion,
  className = 'size-9 text-sm',
}: {
  name: string;
  avatarVersion: string | null;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const [failedVersion, setFailedVersion] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Картинка из серверной разметки может не загрузиться ещё до гидратации, и onError тогда не
  // сработает: проверяем её состояние после монтирования.
  useEffect(() => {
    const img = imgRef.current;
    if (avatarVersion && img?.complete && img.naturalWidth === 0) setFailedVersion(avatarVersion);
  }, [avatarVersion]);
  if (avatarVersion && failedVersion !== avatarVersion) {
    return (
      // Своё фото, отдаётся с private-кешем: next/image здесь не нужен.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={imgRef}
        src={`/account/avatar?v=${encodeURIComponent(avatarVersion)}`}
        alt=""
        onError={() => setFailedVersion(avatarVersion)}
        className={`shrink-0 rounded-full bg-muted-tint object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-ink font-semibold text-canvas ${className}`}
    >
      {initial}
    </span>
  );
}
