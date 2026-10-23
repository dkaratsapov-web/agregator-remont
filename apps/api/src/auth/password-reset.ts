import { PASSWORD_RESET_LIMITS, type PasswordResetLinkDto } from '@agregator/shared';
import type { Prisma } from '@prisma/client';
import { writeAudit } from '../audit/audit';
import { generateSessionToken, hashSessionToken } from './session-token';

export const RESET_TTL_MS = PASSWORD_RESET_LIMITS.TTL_HOURS * 60 * 60 * 1000;

/**
 * Новая одноразовая ссылка для пароля: прежние неиспользованные ссылки этого человека
 * отменяются, в базе остаётся только SHA-256 токена. Вызывать в транзакции под блокировкой строки
 * пользователя. Общая для администратора (API) и команды на сервере (cli/password-reset-link.ts).
 */
export async function issuePasswordReset(
  tx: Prisma.TransactionClient,
  userId: string,
  issuedById: string | null,
): Promise<PasswordResetLinkDto> {
  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS);
  const { count } = await tx.passwordReset.deleteMany({ where: { userId, usedAt: null } });
  await tx.passwordReset.create({
    data: { userId, tokenHash: hashSessionToken(token), issuedById, expiresAt, createdAt: now },
  });
  await writeAudit(tx, {
    actorId: issuedById ?? userId,
    action: 'PASSWORD_RESET_ISSUED',
    entityType: 'user',
    entityId: userId,
    changes: {
      via: { from: null, to: issuedById ? 'admin' : 'server' },
      replaced: { from: count, to: 0 },
    },
  });
  return { token, expiresAt: expiresAt.toISOString() };
}
