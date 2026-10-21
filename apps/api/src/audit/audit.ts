import { AuditAction, Prisma } from '@prisma/client';

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

/** Только изменившиеся поля из списка `fields`. */
export function diffFields<T extends object>(
  before: T | null,
  after: T,
  fields: readonly (keyof T)[],
): FieldChanges {
  const changes: FieldChanges = {};
  for (const field of fields) {
    const from = before ? before[field] : null;
    const to = after[field];
    if (from !== to) changes[String(field)] = { from: from ?? null, to: to ?? null };
  }
  return changes;
}

/** Запись журнала в переданной транзакции, чтобы изменение и запись были атомарны. */
export function writeAudit(
  db: Prisma.TransactionClient,
  entry: {
    actorId: string;
    action: AuditAction;
    entityType:
      | 'job'
      | 'bid'
      | 'job_stage'
      | 'job_message'
      | 'contractor_profile'
      | 'lead'
      | 'user'
      | 'report'
      | 'review';
    entityId: string;
    changes: FieldChanges;
  },
) {
  return db.auditLog.create({
    data: { ...entry, changes: entry.changes as Prisma.InputJsonValue },
  });
}
