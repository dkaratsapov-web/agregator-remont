import type { ContractorRatingDto } from '@agregator/shared';
import type { Prisma } from '@prisma/client';

/** Рейтинг исполнителей: среднее по видимым отзывам с одним знаком и их число. */
export async function ratingsFor(
  db: Prisma.TransactionClient,
  contractorIds: string[],
): Promise<Map<string, ContractorRatingDto>> {
  const ids = [...new Set(contractorIds)];
  const groups = ids.length
    ? await db.review.groupBy({
        by: ['contractorId'],
        where: { contractorId: { in: ids }, hiddenAt: null },
        _avg: { rating: true },
        _count: { _all: true },
      })
    : [];
  const byId = new Map<string, ContractorRatingDto>(
    groups.map((g) => [
      g.contractorId,
      {
        average: g._avg.rating === null ? null : Math.round(g._avg.rating * 10) / 10,
        count: g._count._all,
      },
    ]),
  );
  return new Map(ids.map((id) => [id, byId.get(id) ?? { average: null, count: 0 }]));
}
