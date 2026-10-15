import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;
/** base64url от 32 байт без паддинга — ровно 43 символа. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isWellFormedSessionToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}
