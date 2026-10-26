import {
  FEEDBACK_LIMITS,
  type AdminFeedbackDto,
  type FeedbackDto,
  type Paginated,
} from '@agregator/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Feedback, Prisma, User } from '@prisma/client';
import { writeAudit } from '../audit/audit';
import { QuotaExceeded } from '../common/api-error';
import { ENTITY_ID_PATTERN } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateFeedbackDto, ListFeedbackQuery } from './dto/feedback.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
/** «Мои обращения»: последние обращения человека, больше в кабинете не нужно. */
const MINE_LIMIT = 50;
const NOT_FOUND = 'Обращение не найдено';

const AUTHOR = { select: { id: true, publicId: true, name: true, role: true } } as const;

export function toFeedbackDto(row: Feedback): FeedbackDto {
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    page: row.page,
    createdAt: row.createdAt.toISOString(),
    reply: row.reply,
    repliedAt: row.repliedAt?.toISOString() ?? null,
  };
}

/** Обратная связь участников тестирования (docs/FEEDBACK.md). */
@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Новое обращение. Суточный лимит считается под блокировкой строки пользователя: параллельные
   * отправки не проходят сверх лимита.
   */
  async create(user: User, dto: CreateFeedbackDto): Promise<FeedbackDto> {
    const since = new Date(Date.now() - DAY_MS);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const today = await tx.feedback.findMany({
        where: { userId: user.id, createdAt: { gt: since } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      if (today.length >= FEEDBACK_LIMITS.PER_DAY_MAX) {
        throw new QuotaExceeded(
          `Не больше ${FEEDBACK_LIMITS.PER_DAY_MAX} обращений в сутки. Попробуйте позже`,
          today[0]?.createdAt,
          DAY_MS,
        );
      }
      const row = await tx.feedback.create({
        data: { userId: user.id, kind: dto.kind, body: dto.body, page: dto.page ?? null },
      });
      return toFeedbackDto(row);
    });
  }

  async mine(user: User): Promise<FeedbackDto[]> {
    const rows = await this.prisma.feedback.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MINE_LIMIT,
    });
    return rows.map(toFeedbackDto);
  }

  async list(query: ListFeedbackQuery): Promise<Paginated<AdminFeedbackDto>> {
    const { page, limit, status } = query;
    const where: Prisma.FeedbackWhereInput =
      status === 'open'
        ? { repliedAt: null }
        : status === 'answered'
          ? { repliedAt: { not: null } }
          : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feedback.findMany({
        where,
        // Без ответа — сначала старые (очередь), с ответом — сначала свежие.
        orderBy:
          status === 'open'
            ? [{ createdAt: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { user: AUTHOR },
      }),
      this.prisma.feedback.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({ ...toFeedbackDto(row), author: row.user })),
      page,
      limit,
      total,
    };
  }

  /**
   * Ответ администратора — один раз. Строка обращения блокируется: два администратора,
   * ответившие одновременно, идут по очереди, второй получает 409, ответ не затирается.
   */
  async reply(adminId: string, id: string, reply: string): Promise<AdminFeedbackDto> {
    if (!ENTITY_ID_PATTERN.test(id)) throw new NotFoundException(NOT_FOUND);
    return this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ replied_at: Date | null }[]>`
        SELECT replied_at FROM feedback WHERE id = ${id} FOR UPDATE`;
      if (!locked) throw new NotFoundException(NOT_FOUND);
      if (locked.replied_at) throw new ConflictException('На это обращение уже ответили');
      const row = await tx.feedback.update({
        where: { id },
        data: { reply, repliedAt: new Date(), repliedById: adminId },
        include: { user: AUTHOR },
      });
      await writeAudit(tx, {
        actorId: adminId,
        action: 'FEEDBACK_REPLIED',
        entityType: 'feedback',
        entityId: id,
        changes: { repliedAt: { from: null, to: row.repliedAt?.toISOString() ?? null } },
      });
      return { ...toFeedbackDto(row), author: row.user };
    });
  }
}
