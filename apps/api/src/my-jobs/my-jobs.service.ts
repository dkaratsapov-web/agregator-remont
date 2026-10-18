import {
  JOB_LIMITS,
  validateJobDetails,
  validateJobItems,
  type JobCategory,
  type JobDetails,
  type JobItem,
  type OwnJobDto,
  type Paginated,
} from '@agregator/shared';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Job, Prisma } from '@prisma/client';
import { diffFields, writeAudit, type FieldChanges } from '../audit/audit';
import { BidsService } from '../bids/bids.service';
import { PaginationQuery } from '../jobs/dto/list-jobs.query';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto, UpdateJobDto } from './dto/job-input.dto';
import { readJobDetails, readJobItems } from '../jobs/job.mapper';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly bids: BidsService,
  ) {}

  async list(ownerId: string, query: PaginationQuery): Promise<Paginated<OwnJobDto>> {
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
    // Анкета обязательна: обязательные вопросы категории должны быть отвечены.
    const details = checkDetails(dto.category, dto.details);
    const extraItems = checkItems(dto.category, dto.extraItems ?? []);

    const job = await this.prisma.$transaction(async (tx) => {
      // Блокировка строки пользователя сериализует создание заказов одним пользователем:
      // параллельные запросы считают квоту по очереди и не могут превысить её.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
      const createdToday = await tx.job.count({
        where: { ownerId, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
      });
      if (createdToday >= JOB_LIMITS.CREATED_PER_DAY) {
        throw new HttpException(
          `Можно создать не больше ${JOB_LIMITS.CREATED_PER_DAY} заказов за сутки`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Явный список полей: владелец и статус задаются только сервером.
      const created = await tx.job.create({
        data: {
          title: dto.title,
          description: dto.description,
          category: dto.category,
          city: dto.city,
          budgetMin: dto.budgetMin,
          budgetMax: dto.budgetMax,
          details,
          extraItems: extraItems as unknown as Prisma.InputJsonArray,
          ownerId,
        },
      });
      // Опубликован из черновика: черновик удаляется вместе с созданием заказа. Чужой или уже
      // удалённый черновик просто не найдётся (условие по владельцу).
      if (dto.draftId) await tx.jobDraft.deleteMany({ where: { id: dto.draftId, ownerId } });
      await writeAudit(tx, {
        actorId: ownerId,
        action: 'JOB_CREATED',
        entityType: 'job',
        entityId: created.id,
        changes: {
          ...diffFields(null, created, [...EDITABLE_FIELDS, 'status']),
          ...diffDetails({}, details),
          ...diffItems([], extraItems),
        },
      });
      return created;
    });
    return toOwnJobDto(job);
  }

  async update(ownerId: string, id: string, dto: UpdateJobDto): Promise<OwnJobDto> {
    const job = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockOwned(tx, ownerId, id);
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
      const category = dto.category ?? current.category;
      const before = readJobDetails(current);
      let details: JobDetails | undefined;
      if (dto.details !== undefined) {
        details = checkDetails(category, dto.details);
      } else if (category !== current.category) {
        // У новой категории своя анкета с обязательными вопросами: без ответов не меняем.
        throw new BadRequestException('При смене категории заполните анкету новой категории');
      }
      // Правка без details оставляет ответы как есть. У заказов, созданных до анкеты (legacy),
      // ответов нет: владелец видит это на странице заказа и дополняет анкету через форму.
      if (details !== undefined) data.details = details;
      // Позиции: новые целиком или прежние, проверенные заново против основной категории
      // (новая основная не должна совпадать с категорией позиции).
      const itemsBefore = readJobItems(current);
      let extraItems: JobItem[] | undefined;
      if (dto.extraItems !== undefined) {
        extraItems = checkItems(category, dto.extraItems);
      } else if (category !== current.category) {
        extraItems = checkItems(category, itemsBefore);
      }
      if (extraItems !== undefined) {
        data.extraItems = extraItems as unknown as Prisma.InputJsonArray;
      }
      if (Object.keys(data).length === 0) {
        throw new BadRequestException('Нет полей для изменения');
      }
      assertBudgetRange(
        dto.budgetMin !== undefined ? dto.budgetMin : current.budgetMin,
        dto.budgetMax !== undefined ? dto.budgetMax : current.budgetMax,
      );

      // Строка заблокирована: между чтением `current` и записью её никто не изменит,
      // поэтому «было» в журнале — это действительно предыдущее состояние.
      const updated = await tx.job.update({ where: { id }, data });

      const changes = {
        ...diffFields(current, updated, EDITABLE_FIELDS),
        ...(details !== undefined ? diffDetails(before, details) : {}),
        ...(extraItems !== undefined ? diffItems(itemsBefore, extraItems) : {}),
      };
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
      const current = await this.lockOwned(tx, ownerId, id);
      if (current.status === 'CLOSED') throw new ConflictException('Заказ уже закрыт');
      const closed = await tx.job.update({ where: { id }, data: { status: 'CLOSED' } });
      // Ожидающие отклики закрытого заказа больше не могут быть выбраны.
      await this.bids.rejectPending(tx, ownerId, id);
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

  /**
   * Блокирует строку своего заказа (SELECT … FOR UPDATE) до конца транзакции и читает её
   * актуальное состояние. Параллельные правка и закрытие одного заказа выполняются по очереди.
   */
  private async lockOwned(db: Prisma.TransactionClient, ownerId: string, id: string): Promise<Job> {
    if (!JOB_ID_PATTERN.test(id)) throw new NotFoundException(NOT_FOUND);
    const locked = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM jobs WHERE id = ${id} AND owner_id = ${ownerId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException(NOT_FOUND);
    return this.findOwned(db, ownerId, id);
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

function checkDetails(category: JobCategory, input: unknown): JobDetails {
  const result = validateJobDetails(category, input);
  if (!result.ok) throw new BadRequestException(`Анкета заказа: ${result.message}`);
  return result.details;
}

function checkItems(category: JobCategory, input: unknown): JobItem[] {
  const result = validateJobItems(category, input);
  if (!result.ok) throw new BadRequestException(`Позиции заказа: ${result.message}`);
  return result.items;
}

/** Позиции в журнале: одно поле extraItems, если они изменились. */
function diffItems(before: JobItem[], after: JobItem[]): FieldChanges {
  return JSON.stringify(before) === JSON.stringify(after)
    ? {}
    : { extraItems: { from: before, to: after } };
}

/** Ответы анкеты в журнале: одно поле details, если ответы изменились. */
function diffDetails(before: JobDetails, after: JobDetails): FieldChanges {
  return JSON.stringify(before) === JSON.stringify(after)
    ? {}
    : { details: { from: before, to: after } };
}
