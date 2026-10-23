import type { JobDto, Paginated } from '@agregator/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsageCounters } from '../analytics/usage';
import { ApiError } from '../common/api-error';
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
    const { page, limit, category, status, budgetFrom, budgetTo, days, noBids, sort } = query;
    if (budgetFrom !== undefined && budgetTo !== undefined && budgetFrom > budgetTo) {
      throw new ApiError(400, 'BUDGET_RANGE_INVALID', 'Бюджет «от» больше, чем «до»');
    }
    const city = query.city ? escapeLike(query.city) : undefined;
    const q = query.q ? escapeLike(query.q) : undefined;
    // Бюджет: диапазон заказа пересекается с запрошенным. Заказ «до 100 000» подходит под
    // «от 50 000»; заказы без бюджета при фильтре по бюджету не показываются.
    const budget: Prisma.JobWhereInput[] = [
      ...(budgetFrom !== undefined
        ? [
            {
              OR: [
                { budgetMax: { gte: budgetFrom } },
                { budgetMax: null, budgetMin: { gte: budgetFrom } },
              ],
            },
          ]
        : []),
      ...(budgetTo !== undefined
        ? [
            {
              OR: [
                { budgetMin: { lte: budgetTo } },
                { budgetMin: null, budgetMax: { lte: budgetTo } },
              ],
            },
          ]
        : []),
    ];
    const where: Prisma.JobWhereInput = {
      // Скрытые модератором заказы в каталоге не показываются.
      hiddenAt: null,
      // Заказ находится по любой своей категории, не только по основной.
      ...(category ? { categories: { has: category } } : {}),
      ...(status ? { status } : {}),
      ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
      ...(days ? { createdAt: { gte: new Date(Date.now() - days * 86_400_000) } } : {}),
      // «Без откликов»: отозванные, скрытые модератором и отклики заблокированных мастеров не
      // в счёт — такой мастер недоступен (аудит 23.10.2026, F-06).
      ...(noBids
        ? {
            bids: {
              none: {
                status: { not: 'WITHDRAWN' },
                hiddenAt: null,
                contractor: { blockedAt: null },
              },
            },
          }
        : {}),
      AND: [
        ...budget,
        ...(q
          ? [
              {
                OR: [
                  { title: { contains: q, mode: 'insensitive' as const } },
                  { description: { contains: q, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
    };
    const newest: Prisma.JobOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];
    // «Сначала больше» — по нижней границе (сколько заказчик готов платить точно), «сначала
    // меньше» — по верхней; заказы без бюджета в конце.
    const orderBy: Prisma.JobOrderByWithRelationInput[] =
      sort === 'budget_desc'
        ? [
            { budgetMin: { sort: 'desc', nulls: 'last' } },
            { budgetMax: { sort: 'desc', nulls: 'last' } },
            ...newest,
          ]
        : sort === 'budget_asc'
          ? [
              { budgetMax: { sort: 'asc', nulls: 'last' } },
              { budgetMin: { sort: 'asc', nulls: 'last' } },
              ...newest,
            ]
          : newest;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        orderBy,
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
