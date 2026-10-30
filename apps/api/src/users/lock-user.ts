import { UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Записи одного человека — по очереди (квоты, «было» в журнале), и только пока аккаунт жив.
 *
 * FOR NO KEY UPDATE, а не FOR UPDATE: очередь та же (конфликтует с собой, с FOR UPDATE входа,
 * блокировки и удаления аккаунта), но не мешает FOR KEY SHARE, который берут внешние ключи.
 * Иначе «В избранное» или повторный отклик мастера и выбор исполнителя (заказ заблокирован,
 * уведомление этому мастеру ждёт его строку) взаимно блокировались, ответ 500.
 *
 * Блокировка и удаление проверяются под этой же строкой: запрос, прошедший проверку сессии до
 * удаления или блокировки аккаунта, не запишет данные после них (401).
 */
export async function lockActiveUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const [row] = await tx.$queryRaw<{ blocked_at: Date | null; deleted_at: Date | null }[]>`
    SELECT blocked_at, deleted_at FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;
  if (!row || row.blocked_at || row.deleted_at) {
    throw new UnauthorizedException('Требуется вход в аккаунт');
  }
}
