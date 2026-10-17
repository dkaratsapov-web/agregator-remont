/** Фото профиля или первая буква имени. Фото отдаёт /account/avatar (только своё). */
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
  if (avatarVersion) {
    return (
      // Своё фото, отдаётся с private-кешем: next/image здесь не нужен.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/account/avatar?v=${encodeURIComponent(avatarVersion)}`}
        alt=""
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
