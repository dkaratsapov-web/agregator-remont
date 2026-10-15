import type { JobDto, Paginated } from '@agregator/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListJobsQuery } from './dto/list-jobs.query';
import { toJobDto } from './job.mapper';

/** cuid и id демо-данных; всё остальное заведомо не существует. */
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListJobsQuery): Promise<Paginated<JobDto>> {
    const { page, limit, category } = query;
    const where: Prisma.JobWhereInput = category ? { category } : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.job.count({ where }),
    ]);

    return { items: items.map(toJobDto), page, limit, total };
  }

  async getById(id: string): Promise<JobDto> {
    const job = JOB_ID_PATTERN.test(id)
      ? await this.prisma.job.findUnique({ where: { id } })
      : null;
    if (!job) {
      throw new NotFoundException('Заказ не найден');
    }
    return toJobDto(job);
  }
}
