import { detectContacts } from '@agregator/shared';
import type { Prisma } from '@prisma/client';

/**
 * Автопроверка текста сообщения или отклика: похоже на контакты — пометка в очереди
 * администратора (одна на предмет; правка отклика обновляет найденное и снова открывает её).
 * Вызывать в транзакции, которая создаёт или меняет текст.
 */
export async function flagContacts(
  tx: Prisma.TransactionClient,
  target: { type: 'MESSAGE' | 'BID'; id: string; jobId: string; authorId: string; text: string },
): Promise<void> {
  const kinds = detectContacts(target.text);
  if (kinds.length === 0) return;
  const joined = kinds.join(',');
  await tx.contentFlag.upsert({
    where: { targetType_targetId: { targetType: target.type, targetId: target.id } },
    create: {
      targetType: target.type,
      targetId: target.id,
      jobId: target.jobId,
      authorId: target.authorId,
      kinds: joined,
    },
    update: { kinds: joined, status: 'OPEN', resolvedAt: null, resolvedById: null },
  });
}
