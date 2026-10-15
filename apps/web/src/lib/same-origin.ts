/**
 * Проверка источника запроса для Server Actions (защита от CSRF, второй слой поверх Next.js).
 *
 * Next.js сам отклоняет action с чужим Origin, но пропускает запрос вообще без Origin
 * (только предупреждение в логе). Здесь Origin обязателен, `null` отклоняется, а
 * Sec-Fetch-Site, если браузер его прислал, должен быть same-origin.
 *
 * Origin сравнивается:
 * - с `publicOrigin` (WEB_PUBLIC_ORIGIN), если он задан — тогда заголовки Host и
 *   X-Forwarded-Host не используются вовсе и их подмена ничего не даёт (обязательно в production);
 * - иначе с хостом запроса (X-Forwarded-Host от proxy или Host) — режим для разработки.
 */
export function isSameOriginRequest(
  get: (name: string) => string | null,
  publicOrigin?: string,
): boolean {
  const fetchSite = get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return false;

  const origin = get('origin');
  if (!origin || origin === 'null') return false;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  if (publicOrigin) {
    return originUrl.origin === publicOrigin;
  }

  const host = (get('x-forwarded-host') ?? get('host'))?.split(',')[0]?.trim().toLowerCase();
  return !!host && originUrl.host.toLowerCase() === host;
}

/** Нормализует WEB_PUBLIC_ORIGIN; бросает ошибку на некорректное значение. */
export function parsePublicOrigin(raw: string | undefined): string | undefined {
  if (!raw || raw.trim() === '') return undefined;
  const url = new URL(raw.trim());
  if (url.origin !== raw.trim().replace(/\/$/, '') || !/^https?:$/.test(url.protocol)) {
    throw new Error(
      `WEB_PUBLIC_ORIGIN must be a bare origin like https://remont.example, got "${raw}"`,
    );
  }
  return url.origin;
}
