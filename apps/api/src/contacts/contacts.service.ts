import type { ContactExchangeDto } from '@agregator/shared';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { writeAudit } from '../audit/audit';
import { findDeal, type Deal } from '../plans/deal';
import { PrismaService } from '../prisma/prisma.service';

const NO_DEAL = 'Контакты можно открыть после выбора исполнителя';

/**
 * Обмен контактами по согласию сторон сделки. Телефон и email стороны видны второй стороне,
 * только пока есть строка согласия для текущего выбранного отклика. Остальным — 404, как и
 * весь заказ (findDeal). Заблокированному контакты второй стороны не показываются.
 */
@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  state(userId: string, jobId: string): Promise<ContactExchangeDto> {
    return this.prisma.$transaction(async (tx) =>
      this.read(tx, userId, await findDeal(tx, userId, jobId, false, NO_DEAL)),
    );
  }

  /** Открыть (shared = true) или скрыть свои контакты. Повтор ничего не меняет. */
  setShared(userId: string, jobId: string, shared: boolean): Promise<ContactExchangeDto> {
    return this.prisma.$transaction(async (tx) => {
      // Под блокировкой заказа: идёт по очереди с отказом исполнителя и выбором другого.
      const deal = await findDeal(tx, userId, jobId, true, NO_DEAL);
      const changed = shared
        ? (
            await tx.contactShare.createMany({
              data: [{ bidId: deal.acceptedBidId, userId }],
              skipDuplicates: true,
            })
          ).count
        : (await tx.contactShare.deleteMany({ where: { bidId: deal.acceptedBidId, userId } }))
            .count;
      if (changed > 0) {
        await writeAudit(tx, {
          actorId: userId,
          action: shared ? 'CONTACTS_SHARED' : 'CONTACTS_HIDDEN',
          entityType: 'job',
          entityId: jobId,
          changes: {
            contactsShared: { from: !shared, to: shared },
            bidId: { from: null, to: deal.acceptedBidId },
          },
        });
      }
      return this.read(tx, userId, deal);
    });
  }

  private async read(
    tx: Prisma.TransactionClient,
    userId: string,
    deal: Deal,
  ): Promise<ContactExchangeDto> {
    const counterpartId = deal.viewer === 'OWNER' ? deal.contractorId : deal.ownerId;
    const [people, shares] = await Promise.all([
      tx.user.findMany({
        where: { id: { in: counterpartId ? [userId, counterpartId] : [userId] } },
        select: { id: true, name: true, email: true, phone: true, blockedAt: true },
      }),
      tx.contactShare.findMany({
        where: { bidId: deal.acceptedBidId },
        select: { userId: true, createdAt: true },
      }),
    ]);
    const me = people.find((person) => person.id === userId);
    const other = counterpartId ? people.find((person) => person.id === counterpartId) : undefined;
    const mine = shares.find((share) => share.userId === userId);
    const theirsShared = !!other && shares.some((share) => share.userId === other.id);
    return {
      viewer: deal.viewer,
      counterpartName: other?.name ?? (deal.viewer === 'OWNER' ? 'Исполнитель' : 'Заказчик'),
      mySharedAt: mine ? mine.createdAt.toISOString() : null,
      myPhoneSet: !!me?.phone,
      theirs:
        other && theirsShared && !other.blockedAt
          ? { name: other.name, phone: other.phone, email: other.email }
          : null,
    };
  }
}
