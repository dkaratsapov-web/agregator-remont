import { createHash } from 'node:crypto';

/**
 * Администраторы назначаются по email без доступа к серверу: в репозитории лежит только
 * SHA-256 адреса (в нижнем регистре), не сам адрес. При регистрации или входе с таким email
 * роль меняется на ADMIN. Дополнительно можно задать ADMIN_EMAILS (через запятую) в окружении.
 * Добавить администратора может только тот, кто может изменить main (см. docs/SECURITY.md).
 */
const ADMIN_EMAIL_SHA256: readonly string[] = [];

export function emailSha256(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export function isAdminEmail(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const normalized = email.trim().toLowerCase();
  const fromEnv = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.includes(normalized) || ADMIN_EMAIL_SHA256.includes(emailSha256(normalized));
}
