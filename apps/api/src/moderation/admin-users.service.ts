import {
  ADMIN_USER_LIMITS,
  type AdminUserDto,
  type Paginated,
  type PasswordResetLinkDto,
} from '@agregator/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { issuePasswordReset } from '../auth/password-reset';
import { ENTITY_ID_PATTERN } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersQuery } from './dto/moderation.dto';

const USER_NOT_FOUND = 'Пользователь не найден';

/**
 * Пользователи для администратора: поиск по email, имени или номеру аккаунта, сколько у человека
 * заказов, откликов и открытых жалоб на него; выдача ссылки для нового пароля (почты нет).
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersQuery): Promise<Paginated<AdminUserDto>> {
    const limit = ADMIN_USER_LIMITS.PAGE;
    const q = query.q ?? '';
    const publicId = /^\d{1,9}$/.test(q) ? Number(q) : null;
    const where: Prisma.UserWhereInput = q
      ? {
          OR: [
            { email: { contains: q.toLowerCase() } },
            { name: { contains: q, mode: 'insensitive' } },
            ...(publicId ? [{ publicId }] : []),
          ],
        }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * limit,
        take: limit,
        select: {
          id: true,
          publicId: true,
          email: true,
          name: true,
          role: true,
          blockedAt: true,
          createdAt: true,
          _count: { select: { jobs: true, bids: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    const ids = rows.map((r) => r.id);
    const open = ids.length
      ? await this.prisma.$queryRaw<{ author_id: string; n: number }[]>`
          SELECT author_id, count(*)::int AS n FROM (
            SELECT j.owner_id AS author_id FROM reports r JOIN jobs j ON j.id = r.target_id
              WHERE r.status = 'OPEN' AND r.target_type = 'JOB'
            UNION ALL
            SELECT m.author_id FROM reports r JOIN job_messages m ON m.id = r.target_id
              WHERE r.status = 'OPEN' AND r.target_type = 'MESSAGE'
            UNION ALL
            SELECT b.contractor_id FROM reports r JOIN bids b ON b.id = r.target_id
              WHERE r.status = 'OPEN' AND r.target_type = 'BID'
          ) t WHERE author_id = ANY(${ids}::text[]) GROUP BY author_id`
      : [];
    const openBy = new Map(open.map((o) => [o.author_id, o.n]));
    return {
      items: rows.map((u) => ({
        id: u.id,
        publicId: u.publicId,
        email: u.email,
        name: u.name,
        role: u.role,
        blocked: !!u.blockedAt,
        createdAt: u.createdAt.toISOString(),
        jobs: u._count.jobs,
        bids: u._count.bids,
        openReports: openBy.get(u.id) ?? 0,
      })),
      page: query.page,
      limit,
      total,
    };
  }

  /** Ссылка для нового пароля; прежние неиспользованные ссылки человека гаснут. */
  async issuePasswordReset(adminId: string, id: string): Promise<PasswordResetLinkDto> {
    if (!ENTITY_ID_PATTERN.test(id)) throw new NotFoundException(USER_NOT_FOUND);
    return this.prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<{ blocked_at: Date | null }[]>`
        SELECT blocked_at FROM users WHERE id = ${id} FOR UPDATE`;
      if (!user) throw new NotFoundException(USER_NOT_FOUND);
      if (user.blocked_at) {
        throw new ConflictException('Аккаунт заблокирован: сначала разблокируйте его');
      }
      return issuePasswordReset(tx, id, adminId);
    });
  }
}
