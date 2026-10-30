import {
  FAVORITE_LIMITS,
  type FavoriteIdsDto,
  type FavoriteStateDto,
  type JobDto,
  type Paginated,
} from '@agregator/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ENTITY_ID_PATTERN } from '../common/text';
import { toJobDto } from '../jobs/job.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { lockActiveUser } from '../users/lock-user';

const JOB_NOT_FOUND = 'Заказ не найден';

/**
 * Избранные заказы: закладки в каталоге. Добавить можно только видимый заказ; скрытые
 * модератором из списка пропадают. Повтор «добавить» и «убрать» ничего не меняет.
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, page: number): Promise<Paginated<JobDto>> {
    const limit = FAVORITE_LIMITS.PAGE;
    const where = { userId, job: { hiddenAt: null } };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.favoriteJob.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { jobId: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { job: true },
      }),
      this.prisma.favoriteJob.count({ where }),
    ]);
    return { items: rows.map((r) => toJobDto(r.job)), page, limit, total };
  }

  async ids(userId: string): Promise<FavoriteIdsDto> {
    const rows = await this.prisma.favoriteJob.findMany({
      where: { userId, job: { hiddenAt: null } },
      select: { jobId: true },
      take: FAVORITE_LIMITS.MAX,
    });
    return { jobIds: rows.map((r) => r.jobId) };
  }

  async add(userId: string, jobId: string): Promise<FavoriteStateDto> {
    if (!ENTITY_ID_PATTERN.test(jobId)) throw new NotFoundException(JOB_NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      // Закладки одного человека — по очереди: предел считается точно.
      await lockActiveUser(tx, userId);
      const job = await tx.job.findUnique({ where: { id: jobId }, select: { hiddenAt: true } });
      if (!job || job.hiddenAt) throw new NotFoundException(JOB_NOT_FOUND);
      const exists = await tx.favoriteJob.findUnique({
        where: { userId_jobId: { userId, jobId } },
        select: { jobId: true },
      });
      if (exists) return;
      // Считаются только видимые: скрытые модератором человек не видит и убрать не может.
      const count = await tx.favoriteJob.count({ where: { userId, job: { hiddenAt: null } } });
      if (count >= FAVORITE_LIMITS.MAX) {
        throw new ConflictException(
          `В избранном может быть не больше ${FAVORITE_LIMITS.MAX} заказов: уберите ненужные`,
        );
      }
      await tx.favoriteJob.create({ data: { userId, jobId } });
    });
    return { jobId, favorite: true };
  }

  async remove(userId: string, jobId: string): Promise<FavoriteStateDto> {
    if (!ENTITY_ID_PATTERN.test(jobId)) throw new NotFoundException(JOB_NOT_FOUND);
    await this.prisma.favoriteJob.deleteMany({ where: { userId, jobId } });
    return { jobId, favorite: false };
  }
}
