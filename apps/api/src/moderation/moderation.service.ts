import {
  REPORT_LIMITS,
  type BlockedStateDto,
  type HiddenStateDto,
  type Paginated,
  type ReportDto,
  type ReportSubjectDto,
} from '@agregator/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { writeAudit } from '../audit/audit';
import { ENTITY_ID_PATTERN } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import { BlockDto, HideDto, ListReportsQuery, ResolveReportDto } from './dto/moderation.dto';

const REPORT_NOT_FOUND = 'Жалоба не найдена';
const EXCERPT_MAX = 300;

const PERSON = { id: true, publicId: true, name: true, blockedAt: true } as const;
const REPORT_SELECT = {
  id: true,
  targetType: true,
  targetId: true,
  jobId: true,
  reason: true,
  comment: true,
  status: true,
  note: true,
  createdAt: true,
  resolvedAt: true,
  reporter: { select: { id: true, publicId: true, name: true } },
} as const;
type ReportRow = Prisma.ReportGetPayload<{ select: typeof REPORT_SELECT }>;
type Person = { id: string; publicId: number; name: string; blockedAt: Date | null };

const excerpt = (text: string) =>
  text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1)}…` : text;
const author = (person: Person | null): ReportSubjectDto['author'] =>
  person
    ? { id: person.id, publicId: person.publicId, name: person.name, blocked: !!person.blockedAt }
    : null;

/**
 * Модерация для администратора: очередь жалоб, решение по жалобе, скрытие заказа, сообщения
 * или отклика и блокировка аккаунта. Каждое изменение — под блокировкой строки и с записью в
 * журнале в той же транзакции; повтор того же действия ничего не меняет и не пишет.
 */
@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListReportsQuery): Promise<Paginated<ReportDto>> {
    const limit = REPORT_LIMITS.PAGE;
    const where: Prisma.ReportWhereInput = query.status === 'ALL' ? {} : { status: query.status };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        select: REPORT_SELECT,
        // Открытые — старые первыми (очередь), разобранные — новые первыми.
        orderBy:
          query.status === 'OPEN'
            ? [{ createdAt: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);
    return { items: await this.toDtos(rows), page: query.page, limit, total };
  }

  async resolve(adminId: string, id: string, dto: ResolveReportDto): Promise<ReportDto> {
    if (!ENTITY_ID_PATTERN.test(id)) throw new NotFoundException(REPORT_NOT_FOUND);
    const row = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM reports WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException(REPORT_NOT_FOUND);
      if (locked[0].status !== 'OPEN') throw new ConflictException('Жалоба уже разобрана');
      const updated = await tx.report.update({
        where: { id },
        data: {
          status: dto.status,
          note: dto.note,
          resolvedById: adminId,
          resolvedAt: new Date(),
        },
        select: REPORT_SELECT,
      });
      await writeAudit(tx, {
        actorId: adminId,
        action: 'REPORT_RESOLVED',
        entityType: 'report',
        entityId: id,
        changes: { status: { from: 'OPEN', to: dto.status }, note: { from: null, to: dto.note } },
      });
      return updated;
    });
    return (await this.toDtos([row]))[0];
  }

  setJobHidden(adminId: string, id: string, dto: HideDto): Promise<HiddenStateDto> {
    return this.setHidden(adminId, 'job', id, dto, 'Заказ не найден');
  }

  setMessageHidden(adminId: string, id: string, dto: HideDto): Promise<HiddenStateDto> {
    return this.setHidden(adminId, 'job_message', id, dto, 'Сообщение не найдено');
  }

  setBidHidden(adminId: string, id: string, dto: HideDto): Promise<HiddenStateDto> {
    return this.setHidden(adminId, 'bid', id, dto, 'Отклик не найден');
  }

  async setUserBlocked(adminId: string, id: string, dto: BlockDto): Promise<BlockedStateDto> {
    if (!ENTITY_ID_PATTERN.test(id)) throw new NotFoundException('Пользователь не найден');
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ role: string; blocked_at: Date | null }[]>`
        SELECT role::text AS role, blocked_at FROM users WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Пользователь не найден');
      if (locked[0].role === 'ADMIN') {
        throw new ConflictException('Администратора заблокировать нельзя');
      }
      const was = locked[0].blocked_at !== null;
      if (was === dto.blocked) return { id, blocked: was };
      await tx.user.update({ where: { id }, data: { blockedAt: dto.blocked ? new Date() : null } });
      // Блокировка завершает все сеансы сразу: следующий запрос — уже без входа.
      const revoked = dto.blocked
        ? (await tx.session.deleteMany({ where: { userId: id } })).count
        : 0;
      await writeAudit(tx, {
        actorId: adminId,
        action: dto.blocked ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
        entityType: 'user',
        entityId: id,
        changes: {
          blocked: { from: was, to: dto.blocked },
          reason: { from: null, to: dto.reason },
          ...(dto.blocked ? { sessionsRevoked: { from: null, to: revoked } } : {}),
        },
      });
      return { id, blocked: dto.blocked };
    });
  }

  private async setHidden(
    adminId: string,
    entityType: 'job' | 'job_message' | 'bid',
    id: string,
    dto: HideDto,
    notFound: string,
  ): Promise<HiddenStateDto> {
    if (!ENTITY_ID_PATTERN.test(id)) throw new NotFoundException(notFound);
    return this.prisma.$transaction(async (tx) => {
      const locked =
        entityType === 'job'
          ? await tx.$queryRaw<{ hidden_at: Date | null; status: string }[]>`
              SELECT hidden_at, status::text AS status FROM jobs WHERE id = ${id} FOR UPDATE`
          : entityType === 'bid'
            ? await tx.$queryRaw<{ hidden_at: Date | null; status: string }[]>`
                SELECT hidden_at, status::text AS status FROM bids WHERE id = ${id} FOR UPDATE`
            : await tx.$queryRaw<{ hidden_at: Date | null; status: string }[]>`
                SELECT hidden_at, '' AS status FROM job_messages WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException(notFound);
      const was = locked[0].hidden_at !== null;
      if (was === dto.hidden) return { id, hidden: was };
      // Выбранный отклик — основа сделки: его не прячут, а скрывают заказ или блокируют автора.
      if (entityType === 'bid' && dto.hidden && locked[0].status === 'ACCEPTED') {
        throw new ConflictException(
          'Отклик выбран исполнителем: скройте заказ или заблокируйте исполнителя',
        );
      }
      const data = { hiddenAt: dto.hidden ? new Date() : null };
      if (entityType === 'job') await tx.job.update({ where: { id }, data });
      else if (entityType === 'bid') await tx.bid.update({ where: { id }, data });
      else await tx.jobMessage.update({ where: { id }, data });
      await writeAudit(tx, {
        actorId: adminId,
        action: dto.hidden ? 'CONTENT_HIDDEN' : 'CONTENT_RESTORED',
        entityType,
        entityId: id,
        changes: { hidden: { from: was, to: dto.hidden }, reason: { from: null, to: dto.reason } },
      });
      return { id, hidden: dto.hidden };
    });
  }

  /** Жалобы с предметом: что именно, скрыт ли, кто автор и заблокирован ли он. */
  private async toDtos(rows: ReportRow[]): Promise<ReportDto[]> {
    const ids = (type: ReportRow['targetType']) =>
      rows.filter((r) => r.targetType === type).map((r) => r.targetId);
    const [jobs, messages, bids] = await Promise.all([
      this.prisma.job.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.jobId))] } },
        select: { id: true, title: true, hiddenAt: true, owner: { select: PERSON } },
      }),
      this.prisma.jobMessage.findMany({
        where: { id: { in: ids('MESSAGE') } },
        select: {
          id: true,
          body: true,
          hiddenAt: true,
          author: { select: PERSON },
          _count: { select: { photos: true } },
        },
      }),
      this.prisma.bid.findMany({
        where: { id: { in: ids('BID') } },
        select: {
          id: true,
          price: true,
          comment: true,
          hiddenAt: true,
          contractor: { select: PERSON },
        },
      }),
    ]);
    const jobById = new Map(jobs.map((j) => [j.id, j]));
    const messageById = new Map(messages.map((m) => [m.id, m]));
    const bidById = new Map(bids.map((b) => [b.id, b]));

    return rows.map((row) => {
      const job = jobById.get(row.jobId);
      let subject: Omit<ReportSubjectDto, 'jobId' | 'jobTitle'>;
      if (row.targetType === 'JOB') {
        subject = {
          excerpt: job?.title ?? '',
          hidden: !!job?.hiddenAt,
          author: author(job?.owner ?? null),
        };
      } else if (row.targetType === 'MESSAGE') {
        const message = messageById.get(row.targetId);
        const photos = message?._count.photos ?? 0;
        subject = {
          excerpt: message
            ? excerpt(message.body || (photos > 0 ? `Фото без текста: ${photos}` : ''))
            : '',
          hidden: !!message?.hiddenAt,
          author: author(message?.author ?? null),
        };
      } else {
        const bid = bidById.get(row.targetId);
        subject = {
          excerpt: bid ? excerpt(`${bid.price} ₽. ${bid.comment}`) : '',
          hidden: !!bid?.hiddenAt,
          author: author(bid?.contractor ?? null),
        };
      }
      return {
        id: row.id,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        comment: row.comment,
        status: row.status,
        reporter: row.reporter,
        subject: { jobId: row.jobId, jobTitle: job?.title ?? '', ...subject },
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
      };
    });
  }
}
