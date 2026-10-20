import {
  BID_LIMITS,
  type BidRejectReason,
  type JobBidDto,
  type MyBidDto,
  type Paginated,
} from '@agregator/shared';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Job, Prisma } from '@prisma/client';
import { writeAudit } from '../audit/audit';
import { notify } from '../notifications/notify';
import { ENTITY_ID_PATTERN } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import { toJobBidDto, toMyBidDto } from './bid.mapper';
import { CreateBidDto } from './dto/create-bid.dto';
import { ListMyBidsQuery } from './dto/list-my-bids.query';

const DAY_MS = 24 * 60 * 60 * 1000;
const JOB_NOT_FOUND = 'Заказ не найден';
const BID_NOT_FOUND = 'Отклик не найден';

/**
 * Отклики. Правила доступа:
 * - подрядчик создаёт, видит и отзывает только свои отклики;
 * - заказчик видит отклики только на свои заказы и выбирает из них исполнителя;
 * - чужие отклики и заказы неотличимы от несуществующих (404).
 *
 * Порядок блокировок (чтобы не было взаимоблокировок): пользователь → заказ → отклик.
 * Каждая операция берёт подмножество этой цепочки строго в этом порядке:
 * - create: пользователь (FOR UPDATE, квота) → заказ (FOR SHARE);
 * - accept / закрытие заказа: заказ (FOR UPDATE) → отклики (FOR UPDATE);
 * - withdraw: заказ (FOR KEY SHARE) → отклик (FOR UPDATE). Заказ берётся первым, потому что
 *   уведомление заказчику ссылается на заказ (внешний ключ тоже берёт KEY SHARE): взятый после
 *   отклика, он замкнул бы цикл ожидания с accept.
 */
@Injectable()
export class BidsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- подрядчик

  async create(contractorId: string, jobId: string, dto: CreateBidDto): Promise<MyBidDto> {
    if (!ENTITY_ID_PATTERN.test(jobId)) throw new NotFoundException(JOB_NOT_FOUND);

    try {
      const bid = await this.prisma.$transaction(async (tx) => {
        // Квота откликов: создания одного подрядчика выполняются по очереди.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${contractorId} FOR UPDATE`;
        const today = await tx.bid.count({
          where: { contractorId, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
        });
        if (today >= BID_LIMITS.CREATED_PER_DAY) {
          throw new HttpException(
            `Можно оставить не больше ${BID_LIMITS.CREATED_PER_DAY} откликов за сутки`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        // FOR SHARE: отклики на один заказ создаются параллельно, но не во время выбора
        // исполнителя или закрытия заказа (они берут FOR UPDATE).
        const locked = await tx.$queryRaw<{ status: string; hidden_at: Date | null }[]>`
          SELECT status::text AS status, hidden_at FROM jobs WHERE id = ${jobId} FOR SHARE`;
        // Скрытый модератором заказ для откликающегося — как несуществующий.
        if (locked.length === 0 || locked[0].hidden_at) throw new NotFoundException(JOB_NOT_FOUND);
        if (locked[0].status !== 'OPEN') {
          throw new ConflictException('Заказ уже не принимает отклики');
        }

        const created = await tx.bid.create({
          data: {
            jobId,
            contractorId,
            price: dto.price,
            durationDays: dto.durationDays,
            comment: dto.comment,
          },
          include: { job: true },
        });
        await writeAudit(tx, {
          actorId: contractorId,
          action: 'BID_CREATED',
          entityType: 'bid',
          entityId: created.id,
          changes: {
            jobId: { from: null, to: jobId },
            price: { from: null, to: created.price },
            durationDays: { from: null, to: created.durationDays },
            status: { from: null, to: created.status },
          },
        });
        await notify(tx, {
          actorId: contractorId,
          userId: created.job.ownerId,
          jobId,
          kind: 'BID_RECEIVED',
          data: { price: created.price, durationDays: created.durationDays ?? undefined },
        });
        return created;
      });
      return toMyBidDto(bid);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Вы уже откликнулись на этот заказ');
      }
      throw error;
    }
  }

  async listMine(contractorId: string, query: ListMyBidsQuery): Promise<Paginated<MyBidDto>> {
    const where: Prisma.BidWhereInput = {
      contractorId,
      ...(query.jobId ? { jobId: query.jobId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bid.findMany({
        where,
        include: { job: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.bid.count({ where }),
    ]);
    return { items: items.map(toMyBidDto), page: query.page, limit: query.limit, total };
  }

  async withdraw(contractorId: string, bidId: string): Promise<MyBidDto> {
    if (!ENTITY_ID_PATTERN.test(bidId)) throw new NotFoundException(BID_NOT_FOUND);
    const bid = await this.prisma.$transaction(async (tx) => {
      const own = await tx.$queryRaw<{ job_id: string }[]>`
        SELECT job_id FROM bids WHERE id = ${bidId} AND contractor_id = ${contractorId}`;
      if (own.length === 0) throw new NotFoundException(BID_NOT_FOUND);
      await tx.$queryRaw`SELECT id FROM jobs WHERE id = ${own[0].job_id} FOR KEY SHARE`;
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM bids WHERE id = ${bidId} AND contractor_id = ${contractorId} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException(BID_NOT_FOUND);
      const current = await tx.bid.findUniqueOrThrow({ where: { id: bidId } });
      if (current.status !== 'PENDING') {
        throw new ConflictException('Отозвать можно только отклик на рассмотрении');
      }
      const updated = await tx.bid.update({
        where: { id: bidId },
        data: { status: 'WITHDRAWN' },
        include: { job: true },
      });
      await writeAudit(tx, {
        actorId: contractorId,
        action: 'BID_WITHDRAWN',
        entityType: 'bid',
        entityId: bidId,
        changes: { status: { from: current.status, to: updated.status } },
      });
      await notify(tx, {
        actorId: contractorId,
        userId: updated.job.ownerId,
        jobId: updated.jobId,
        kind: 'BID_WITHDRAWN',
      });
      return updated;
    });
    return toMyBidDto(bid);
  }

  // --- заказчик (владелец заказа)

  async listForOwner(ownerId: string, jobId: string): Promise<JobBidDto[]> {
    await this.findOwnedJob(this.prisma, ownerId, jobId);
    const bids = await this.prisma.bid.findMany({
      // Скрытые модератором отклики заказчик не видит.
      where: { jobId, status: { not: 'WITHDRAWN' }, hiddenAt: null },
      include: { contractor: { include: { profile: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return bids.map(toJobBidDto);
  }

  /**
   * Выбор исполнителя: отклик → ACCEPTED, остальные ожидающие → REJECTED, заказ → IN_PROGRESS.
   * Заказ блокируется (FOR UPDATE), поэтому параллельные выборы, отзыв отклика и закрытие
   * заказа выполняются по очереди; уникальный индекс в БД дополнительно запрещает двух
   * выбранных исполнителей на один заказ.
   */
  async accept(ownerId: string, jobId: string, bidId: string): Promise<JobBidDto> {
    if (!ENTITY_ID_PATTERN.test(bidId)) throw new NotFoundException(BID_NOT_FOUND);

    const accepted = await this.prisma.$transaction(async (tx) => {
      const job = await this.lockOwnedJob(tx, ownerId, jobId);
      if (job.status !== 'OPEN') {
        throw new ConflictException('Исполнителя можно выбрать только для открытого заказа');
      }
      // Отклик тоже блокируется: параллельный отзыв не может изменить его между проверкой и записью.
      const lockedBid = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM bids WHERE id = ${bidId} AND job_id = ${jobId} FOR UPDATE`;
      if (lockedBid.length === 0) throw new NotFoundException(BID_NOT_FOUND);
      const bid = await tx.bid.findUniqueOrThrow({ where: { id: bidId } });
      if (bid.hiddenAt) throw new NotFoundException(BID_NOT_FOUND);
      if (bid.status !== 'PENDING') {
        throw new ConflictException('Этот отклик уже нельзя выбрать');
      }

      const updated = await tx.bid.update({
        where: { id: bidId },
        data: { status: 'ACCEPTED' },
        include: { contractor: { include: { profile: true } } },
      });
      await writeAudit(tx, {
        actorId: ownerId,
        action: 'BID_ACCEPTED',
        entityType: 'bid',
        entityId: bidId,
        changes: { status: { from: 'PENDING', to: 'ACCEPTED' } },
      });
      await notify(tx, {
        actorId: ownerId,
        userId: updated.contractorId,
        jobId,
        kind: 'BID_ACCEPTED',
      });

      await this.rejectPending(tx, ownerId, jobId, bidId, 'OTHER_ACCEPTED');

      await tx.job.update({ where: { id: jobId }, data: { status: 'IN_PROGRESS' } });
      await writeAudit(tx, {
        actorId: ownerId,
        action: 'JOB_STARTED',
        entityType: 'job',
        entityId: jobId,
        changes: {
          status: { from: 'OPEN', to: 'IN_PROGRESS' },
          acceptedBidId: { from: null, to: bidId },
        },
      });
      return updated;
    });
    return toJobBidDto(accepted);
  }

  /**
   * Отклоняет все ожидающие отклики заказа (кроме `exceptBidId`) с записью в журнал.
   * Вызывается под блокировкой заказа. Сами отклики блокируются FOR UPDATE: условие
   * `status = 'PENDING'` перепроверяется после ожидания, поэтому параллельно отозванный
   * отклик не будет помечен отклонённым ни в таблице, ни в журнале.
   */
  async rejectPending(
    tx: Prisma.TransactionClient,
    actorId: string,
    jobId: string,
    exceptBidId: string | null,
    reason: BidRejectReason,
  ): Promise<void> {
    const pending = await tx.$queryRaw<{ id: string; contractor_id: string }[]>`
      SELECT id, contractor_id FROM bids
      WHERE job_id = ${jobId} AND status = 'PENDING'::"BidStatus"
        AND (${exceptBidId}::text IS NULL OR id <> ${exceptBidId})
      ORDER BY id
      FOR UPDATE`;
    if (pending.length === 0) return;
    await tx.bid.updateMany({
      where: { id: { in: pending.map((b) => b.id) } },
      data: { status: 'REJECTED', rejectReason: reason },
    });
    for (const bid of pending) {
      await writeAudit(tx, {
        actorId,
        action: 'BID_REJECTED',
        entityType: 'bid',
        entityId: bid.id,
        changes: {
          status: { from: 'PENDING', to: 'REJECTED' },
          rejectReason: { from: null, to: reason },
        },
      });
      await notify(tx, {
        actorId,
        userId: bid.contractor_id,
        jobId,
        kind: 'BID_REJECTED',
        data: { reason },
      });
    }
  }

  private async lockOwnedJob(
    tx: Prisma.TransactionClient,
    ownerId: string,
    jobId: string,
  ): Promise<Job> {
    if (!ENTITY_ID_PATTERN.test(jobId)) throw new NotFoundException(JOB_NOT_FOUND);
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM jobs WHERE id = ${jobId} AND owner_id = ${ownerId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException(JOB_NOT_FOUND);
    return tx.job.findUniqueOrThrow({ where: { id: jobId } });
  }

  private async findOwnedJob(
    db: Prisma.TransactionClient,
    ownerId: string,
    jobId: string,
  ): Promise<Job> {
    const job = ENTITY_ID_PATTERN.test(jobId)
      ? await db.job.findFirst({ where: { id: jobId, ownerId } })
      : null;
    if (!job) throw new NotFoundException(JOB_NOT_FOUND);
    return job;
  }
}
