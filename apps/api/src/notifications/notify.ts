import { randomUUID } from 'node:crypto';
import type { NotificationData, NotificationKind } from '@agregator/shared';
import type { Prisma } from '@prisma/client';

/**
 * Уведомление другой стороне в транзакции события: событие и уведомление атомарны. Получателя
 * может не быть (демо-заказ без владельца) — тогда ничего не пишется; себе не пишется никогда.
 */
export async function notify(
  db: Prisma.TransactionClient,
  entry: {
    actorId: string;
    userId: string | null;
    jobId: string;
    kind: Exclude<NotificationKind, 'MESSAGE'>;
    data?: NotificationData;
  },
): Promise<void> {
  if (!entry.userId || entry.userId === entry.actorId) return;
  await db.notification.create({
    data: {
      userId: entry.userId,
      jobId: entry.jobId,
      kind: entry.kind,
      data: (entry.data ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Новое сообщение: непрочитанные по заказу собираются в одну строку со счётчиком и временем
 * последнего сообщения. Частичный уникальный индекс notifications_message_unread_key делает
 * это атомарным и при параллельной отправке.
 */
export async function notifyMessage(
  db: Prisma.TransactionClient,
  entry: { actorId: string; userId: string | null; jobId: string },
): Promise<void> {
  if (!entry.userId || entry.userId === entry.actorId) return;
  // Время — из приложения в UTC, как у Prisma: столбец без часового пояса.
  const at = new Date().toISOString();
  await db.$executeRaw`
    INSERT INTO notifications (id, user_id, job_id, kind, created_at)
    VALUES (${randomUUID()}, ${entry.userId}, ${entry.jobId}, 'MESSAGE'::"NotificationKind",
            ${at}::timestamptz AT TIME ZONE 'UTC')
    ON CONFLICT (user_id, job_id) WHERE kind = 'MESSAGE'::"NotificationKind" AND read_at IS NULL
    DO UPDATE SET count = LEAST(notifications.count + 1, 10000), created_at = EXCLUDED.created_at`;
}
