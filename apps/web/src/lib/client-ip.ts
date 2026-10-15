/**
 * IP посетителя для передачи в API (rate limit).
 *
 * Next.js сохраняет X-Forwarded-For, присланный клиентом, поэтому первому адресу верить нельзя.
 * Доверяем только адресам, которые дописали наши reverse proxy: при `hops` прокси перед web
 * реальный IP клиента стоит на позиции `длина - hops` (nginx `$proxy_add_x_forwarded_for`
 * дописывает адрес в конец). При hops = 0 IP не определяется и не передаётся.
 */
export function clientIpFromForwardedFor(
  header: string | null | undefined,
  hops: number,
): string | undefined {
  if (!header || hops < 1) return undefined;
  const entries = header
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const candidate = entries[entries.length - hops];
  return candidate && isIpAddress(candidate) ? candidate : undefined;
}

function isIpAddress(value: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value) || /^[0-9a-f:.]{2,45}$/i.test(value);
}

export function parseTrustProxyHops(raw: string | undefined): number {
  if (!raw || raw.trim() === '') return 0;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) {
    throw new Error(`WEB_TRUST_PROXY_HOPS must be an integer 0..10, got "${raw}"`);
  }
  return hops;
}
