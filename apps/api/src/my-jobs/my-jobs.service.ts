import { JOB_LIMITS, type OwnJobDto, type Paginated } from '@agregator/shared';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Job, Prisma } from '@prisma/client';
import { diffFields, writeAudit } from '../audit/audit';
import { ListJobsQuery } from '../jobs/dto/list-jobs.query';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto, UpdateJobDto } from './dto/job-input.dto';
import { toOwnJobDto } from './own-job.mapper';

const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const EDITABLE_FIELDS = [
  'title',
  'description',
  'category',
  'city',
  'budgetMin',
  'budgetMax',
] as const satisfies readonly (keyof Job)[];

const NOT_FOUND = 'Заказ не найден';

/**
 * Заказы в кабинете заказчика. Каждый запрос ограничен владельцем (ownerId = текущий
 * пользователь): чужой заказ неотличим от несуществующего (404), чтобы не раскрывать его наличие.
 */
@Injectable()
export class MyJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, query: ListJobsQuery): Promise<Paginated<OwnJobDto>> {
    const where: Prisma.JobWhereInput = { ownerId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.job.count({ where }),
    ]);
    return { items: items.map(toOwnJobDto), page: query.page, limit: query.limit, total };
  }

  async get(ownerId: string, id: string): Promise<OwnJobDto> {
    return toOwnJobDto(await this.findOwned(this.prisma, ownerId, id));
  }

  async create(ownerId: string, dto: CreateJobDto): Promise<OwnJobDto> {
    assertBudgetRange(dto.budgetMin, dto.budgetMax);

    const createdToday = await this.prisma.job.count({
      where: { ownerId, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
    });
    if (createdToday >= JOB_LIMITS.CREATED_PER_DAY) {
      throw new HttpException(
        `Можно создать не больше ${JOB_LIMITS.CREATED_PER_DAY} заказов за сутки`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const job = await this.prisma.$transaction(async (tx) => {
      // Явный список полей: владелец и статус задаются только сервером.
      const created = await tx.job.create({
        data: {
          title: dto.title,
          description: dto.description,
          category: dto.category,
          city: dto.city,
          budgetMin: dto.budgetMin,
          budgetMax: dto.budgetMax,
          ownerId,
        },
      });
      await writeAudit(tx, {
        actorId: ownerId,
        action: 'JOB_CREATED',
        entityType: 'job',
        entityId: created.id,
        changes: diffFields(null, created, [...EDITABLE_FIELDS, 'status']),
      });
      return created;
    });
    return toOwnJobDto(job);
  }

  async update(ownerId: string, id: string, dto: UpdateJobDto): Promise<OwnJobDto> {
    const job = await this.prisma.$transaction(async (tx) => {
      const current = await this.findOwned(tx, ownerId, id);
      if (current.status !== 'OPEN') {
        throw new ConflictException('Редактировать можно только открытый заказ');
      }

      const data: Prisma.JobUpdateInput = {};
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.category !== undefined) data.category = dto.category;
      if (dto.city !== undefined) data.city = dto.city;
      if (dto.budgetMin !== undefined) data.budgetMin = dto.budgetMin;
      if (dto.budgetMax !== undefined) data.budgetMax = dto.budgetMax;
      if (Object.keys(data).length === 0) {
        throw new BadRequestException('Нет полей для изменения');
      }
      assertBudgetRange(
        dto.budgetMin !== undefined ? dto.budgetMin : current.budgetMin,
        dto.budgetMax !== undefined ? dto.budgetMax : current.budgetMax,
      );

      // Условие по статусу в самом UPDATE защищает от гонки с параллельным закрытием.
      const { count } = await tx.job.updateMany({ where: { id, ownerId, status: 'OPEN' }, data });
      if (count === 0) throw new ConflictException('Редактировать можно только открытый заказ');
      const updated = await tx.job.findUniqueOrThrow({ where: { id } });

      const changes = diffFields(current, updated, EDITABLE_FIELDS);
      if (Object.keys(changes).length > 0) {
        await writeAudit(tx, {
          actorId: ownerId,
          action: 'JOB_UPDATED',
          entityType: 'job',
          entityId: id,
          changes,
        });
      }
      return updated;
    });
    return toOwnJobDto(job);
  }

  async close(ownerId: string, id: string): Promise<OwnJobDto> {
    const job = await this.prisma.$transaction(async (tx) => {
      const current = await this.findOwned(tx, ownerId, id);
      const { count } = await tx.job.updateMany({
        where: { id, ownerId, status: { not: 'CLOSED' } },
        data: { status: 'CLOSED' },
      });
      if (count === 0) throw new ConflictException('Заказ уже закрыт');
      const closed = await tx.job.findUniqueOrThrow({ where: { id } });
      await writeAudit(tx, {
        actorId: ownerId,
        action: 'JOB_CLOSED',
        entityType: 'job',
        entityId: id,
        changes: diffFields(current, closed, ['status']),
      });
      return closed;
    });
    return toOwnJobDto(job);
  }

  private async findOwned(db: Prisma.TransactionClient, ownerId: string, id: string): Promise<Job> {
    const job = JOB_ID_PATTERN.test(id) ? await db.job.findFirst({ where: { id, ownerId } }) : null;
    if (!job) throw new NotFoundException(NOT_FOUND);
    return job;
  }
}

function assertBudgetRange(min: number | null | undefined, max: number | null | undefined): void {
  if (min != null && max != null && min > max) {
    throw new BadRequestException('Минимальный бюджет не может быть больше максимального');
  }
}
