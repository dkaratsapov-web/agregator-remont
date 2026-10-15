/**
 * Проверка конфигурации при старте сервера web: ошибка останавливает запуск,
 * а не проявляется позже на первом запросе. Импорты внутри ветки nodejs, чтобы
 * edge-сборка не тянула node:net.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { parseTrustProxyHops } = await import('./lib/client-ip');
  const { parsePublicOrigin } = await import('./lib/same-origin');

  parseTrustProxyHops(process.env.WEB_TRUST_PROXY_HOPS);
  const publicOrigin = parsePublicOrigin(process.env.WEB_PUBLIC_ORIGIN);
  if (process.env.NODE_ENV === 'production' && !publicOrigin) {
    throw new Error(
      'WEB_PUBLIC_ORIGIN is required in production (public site origin, e.g. https://remont.example)',
    );
  }
}
