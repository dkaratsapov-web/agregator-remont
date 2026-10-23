import type { JobDto, Paginated } from '@agregator/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsageCounters } from '../analytics/usage';
import { PrismaService } from '../prisma/prisma.service';
import { ListJobsQuery } from './dto/list-jobs.query';
import { toJobDto } from './job.mapper';

/**
 * Prisma строит `contains`/`equals` с mode: 'insensitive' через ILIKE и не экранирует его
 * спецсимволы: без этого «%» или «_» в запросе совпадали бы со всеми заказами.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** cuid и id демо-данных; всё остальное заведомо не существует. */
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageCounters,
  ) {}

  async list(query: ListJobsQuery): Promise<Paginated<JobDto>> {
    const { page, limit, category, status } = query;
    const city = query.city ? escapeLike(query.city) : undefined;
    const q = query.q ? escapeLike(query.q) : undefined;
    const where: Prisma.JobWhereInput = {
      // Скрытые модератором заказы в каталоге не показываются.
      hiddenAt: null,
      // Заказ находится по любой своей категории, не только по основной.
      ...(category ? { categories: { has: category } } : {}),
      ...(status ? { status } : {}),
      ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.job.count({ where }),
    ]);

    // Открытие каталога — первая страница; листание дальше не считается.
    if (page === 1) this.usage.add('CATALOG_VIEWS');
    return { items: items.map(toJobDto), page, limit, total };
  }

  async getById(id: string): Promise<JobDto> {
    const job = JOB_ID_PATTERN.test(id)
      ? await this.prisma.job.findUnique({ where: { id } })
      : null;
    // Скрытый модератором заказ посторонним неотличим от удалённого; владелец видит его в кабинете.
    if (!job || job.hiddenAt) {
      throw new NotFoundException('Заказ не найден');
    }
    this.usage.add('JOB_VIEWS');
    return toJobDto(job);
  }
}
