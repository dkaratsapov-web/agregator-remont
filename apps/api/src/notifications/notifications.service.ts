import {
  NOTIFICATION_LIMITS,
  type NotificationData,
  type NotificationDto,
  type NotificationsPageDto,
  type NotificationsSummaryDto,
} from '@agregator/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsQuery, MarkNotificationsReadDto } from './dto/notifications.dto';

const NOTIFICATION_SELECT = {
  id: true,
  kind: true,
  jobId: true,
  count: true,
  data: true,
  readAt: true,
  createdAt: true,
  job: { select: { title: true, ownerId: true } },
} as const;
type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_SELECT }>;

function toNotificationDto(userId: string, row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    kind: row.kind,
    jobId: row.jobId,
    jobTitle: row.job.title,
    party: row.job.ownerId === userId ? 'OWNER' : 'CONTRACTOR',
    count: row.count,
    data: row.data as NotificationData,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Уведомления получателя (пишутся функциями notify/notifyMessage в транзакциях событий).
 * Каждый видит и отмечает только свои: чужие id молча не находятся.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: ListNotificationsQuery): Promise<NotificationsPageDto> {
    let after: Prisma.NotificationWhereInput = {};
    if (query.cursor) {
      const cursor = await this.prisma.notification.findFirst({
        where: { id: query.cursor, userId },
        select: { id: true, createdAt: true },
      });
      if (!cursor) throw new BadRequestException('Неверный курсор');
      after = {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      };
    }
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...after },
        select: NOTIFICATION_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: NOTIFICATION_LIMITS.PAGE + 1,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const items = rows.slice(0, NOTIFICATION_LIMITS.PAGE);
    return {
      items: items.map((row) => toNotificationDto(userId, row)),
      unread,
      nextCursor: rows.length > NOTIFICATION_LIMITS.PAGE ? items[items.length - 1].id : null,
    };
  }

  async summary(userId: string): Promise<NotificationsSummaryDto> {
    const groups = await this.prisma.notification.groupBy({
      by: ['jobId'],
      where: { userId, readAt: null },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
    });
    return {
      unread: groups.reduce((sum, group) => sum + group._count._all, 0),
      jobs: groups
        .slice(0, NOTIFICATION_LIMITS.SUMMARY_JOBS)
        .map((group) => ({ jobId: group.jobId, unread: group._count._all })),
    };
  }

  async markRead(userId: string, dto: MarkNotificationsReadDto): Promise<NotificationsSummaryDto> {
    const chosen = [dto.all, dto.jobId, dto.ids].filter((value) => value !== undefined);
    if (chosen.length !== 1) {
      throw new BadRequestException('Укажите что-то одно: все, заказ или список уведомлений');
    }
    const scope: Prisma.NotificationWhereInput = dto.jobId
      ? { jobId: dto.jobId }
      : dto.ids
        ? { id: { in: dto.ids } }
        : {};
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...scope },
      data: { readAt: new Date() },
    });
    return this.summary(userId);
  }
}
