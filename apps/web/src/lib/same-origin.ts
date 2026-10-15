/**
 * Проверка источника запроса для Server Actions (защита от CSRF, второй слой поверх Next.js).
 *
 * Next.js сам отклоняет action с чужим Origin, но пропускает запрос вообще без Origin
 * (только предупреждение в логе). Здесь Origin обязателен и должен совпадать с хостом,
 * который видит web (X-Forwarded-Host от доверенного proxy или Host), а Sec-Fetch-Site,
 * если браузер его прислал, должен быть same-origin.
 */
export function isSameOriginRequest(get: (name: string) => string | null): boolean {
  const fetchSite = get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return false;

  const origin = get('origin');
  if (!origin || origin === 'null') return false;

  const host = (get('x-forwarded-host') ?? get('host'))?.split(',')[0]?.trim().toLowerCase();
  if (!host) return false;

  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}
