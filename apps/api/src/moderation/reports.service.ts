import { REPORT_LIMITS, type ReportReceivedDto } from '@agregator/shared';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { writeAudit } from '../audit/audit';
import { findDeal } from '../plans/deal';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/moderation.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Жалобы пользователей. Пожаловаться можно только на то, что человек видит: заказ в каталоге
 * (не свой), сообщение в своей сделке (не своё), отклик к своему заказу. Остальное неотличимо
 * от несуществующего (404). Повторная жалоба на то же, пока первая не разобрана, — та же
 * жалоба; не больше REPORT_LIMITS.PER_DAY жалоб за сутки.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: User, dto: CreateReportDto): Promise<ReportReceivedDto> {
    if (dto.reason === 'OTHER' && dto.comment.length < REPORT_LIMITS.COMMENT_MIN) {
      throw new BadRequestException(
        `Опишите, что не так: от ${REPORT_LIMITS.COMMENT_MIN} символов`,
      );
    }
    const jobId = await this.targetJob(user, dto);
    return this.prisma.$transaction(async (tx) => {
      // Жалобы одного человека — по очереди: дубликат и суточный предел считаются точно.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const open = await tx.report.findFirst({
        where: {
          reporterId: user.id,
          targetType: dto.targetType,
          targetId: dto.targetId,
          status: 'OPEN',
        },
        select: { id: true },
      });
      if (open) return { id: open.id, duplicate: true };
      const today = await tx.report.count({
        where: { reporterId: user.id, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
      });
      if (today >= REPORT_LIMITS.PER_DAY) {
        throw new HttpException(
          `Можно отправить не больше ${REPORT_LIMITS.PER_DAY} жалоб за сутки`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const created = await tx.report.create({
        data: {
          reporterId: user.id,
          targetType: dto.targetType,
          targetId: dto.targetId,
          jobId,
          reason: dto.reason,
          comment: dto.comment,
        },
        select: { id: true },
      });
      await writeAudit(tx, {
        actorId: user.id,
        action: 'REPORT_CREATED',
        entityType: 'report',
        entityId: created.id,
        changes: {
          targetType: { from: null, to: dto.targetType },
          targetId: { from: null, to: dto.targetId },
          reason: { from: null, to: dto.reason },
        },
      });
      return { id: created.id, duplicate: false };
    });
  }

  /** Заказ, к которому относится предмет жалобы, если человек вправе на него жаловаться. */
  private async targetJob(user: User, dto: CreateReportDto): Promise<string> {
    switch (dto.targetType) {
      case 'JOB': {
        const job = await this.prisma.job.findUnique({
          where: { id: dto.targetId },
          select: { id: true, ownerId: true, hiddenAt: true },
        });
        if (!job || job.hiddenAt) throw new NotFoundException('Заказ не найден');
        if (job.ownerId === user.id) {
          throw new BadRequestException('На свой заказ пожаловаться нельзя');
        }
        return job.id;
      }
      case 'MESSAGE': {
        const message = await this.prisma.jobMessage.findUnique({
          where: { id: dto.targetId },
          select: { jobId: true, contractorId: true, authorId: true, hiddenAt: true },
        });
        const notFound = new NotFoundException('Сообщение не найдено');
        if (!message || message.hiddenAt) throw notFound;
        const deal = await findDeal(this.prisma, user.id, message.jobId, false).catch(() => {
          throw notFound;
        });
        // Только своя текущая сделка: переписку прежней сделки человек не видит.
        if (deal.contractorId !== message.contractorId) throw notFound;
        if (message.authorId === user.id) {
          throw new BadRequestException('На своё сообщение пожаловаться нельзя');
        }
        return message.jobId;
      }
      case 'BID': {
        const bid = await this.prisma.bid.findUnique({
          where: { id: dto.targetId },
          select: { jobId: true, hiddenAt: true, status: true, job: { select: { ownerId: true } } },
        });
        // Жалуется заказчик на отклик к своему заказу (отозванные он не видит).
        if (!bid || bid.hiddenAt || bid.status === 'WITHDRAWN' || bid.job.ownerId !== user.id) {
          throw new NotFoundException('Отклик не найден');
        }
        return bid.jobId;
      }
    }
  }
}
