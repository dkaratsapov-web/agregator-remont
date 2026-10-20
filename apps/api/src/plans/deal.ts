import type { PlanParty } from '@agregator/shared';
import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ENTITY_ID_PATTERN } from '../common/text';

export const JOB_NOT_FOUND = 'Заказ не найден';

/** Сделка по заказу: заказчик-владелец и исполнитель с выбранным откликом. */
export interface Deal {
  jobId: string;
  status: string;
  ownerId: string | null;
  contractorId: string;
  acceptedBidId: string;
  viewer: PlanParty;
}

/**
 * Заказ и сторона сделки, которой является пользователь. Заказчик-владелец — всегда;
 * исполнитель — только с выбранным откликом. Остальным заказ неотличим от несуществующего
 * (404); заказ без выбранного исполнителя — 404 и для владельца (сделки ещё нет).
 * lock — строка заказа под FOR UPDATE: изменения сделки идут по очереди с выбором исполнителя,
 * закрытием и отказом.
 */
export async function findDeal(
  db: Prisma.TransactionClient,
  userId: string,
  jobId: string,
  lock: boolean,
  noDealMessage = 'Появится после выбора исполнителя',
): Promise<Deal> {
  if (!ENTITY_ID_PATTERN.test(jobId)) throw new NotFoundException(JOB_NOT_FOUND);
  const rows = lock
    ? await db.$queryRaw<{ status: string; owner_id: string | null }[]>`
        SELECT status::text AS status, owner_id FROM jobs WHERE id = ${jobId} FOR UPDATE`
    : await db.$queryRaw<{ status: string; owner_id: string | null }[]>`
        SELECT status::text AS status, owner_id FROM jobs WHERE id = ${jobId}`;
  if (rows.length === 0) throw new NotFoundException(JOB_NOT_FOUND);
  const accepted = await db.bid.findFirst({
    where: { jobId, status: 'ACCEPTED' },
    select: { id: true, contractorId: true },
  });
  const ownerId = rows[0].owner_id;
  const viewer: PlanParty | null =
    ownerId === userId ? 'OWNER' : accepted?.contractorId === userId ? 'CONTRACTOR' : null;
  if (!viewer) throw new NotFoundException(JOB_NOT_FOUND);
  if (!accepted) throw new NotFoundException(noDealMessage);
  return {
    jobId,
    status: rows[0].status,
    ownerId,
    contractorId: accepted.contractorId,
    acceptedBidId: accepted.id,
    viewer,
  };
}
