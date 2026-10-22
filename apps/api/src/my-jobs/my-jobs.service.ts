import { createHash } from 'node:crypto';
import {
  JOB_LIMITS,
  validateJobDetails,
  validateJobItems,
  type JobCategory,
  type JobCloseOutcome,
  type JobDetails,
  type JobItem,
  type OwnJobDto,
  type Paginated,
} from '@agregator/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Job, Prisma } from '@prisma/client';
import { diffFields, writeAudit, type FieldChanges } from '../audit/audit';
import { BidsService } from '../bids/bids.service';
import { notify } from '../notifications/notify';
import { PaginationQuery } from '../jobs/dto/list-jobs.query';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto, UpdateJobDto } from './dto/job-input.dto';
import { readJobDetails, readJobItems } from '../jobs/job.mapper';
import { toOwnJobDto } from './own-job.mapper';
import { ApiError, QuotaExceeded } from '../common/api-error';

const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Повторная публикация того же черновика (ответ 409; web показывает его как есть). */
export const DRAFT_ALREADY_PUBLISHED =
  'Заказ из этого черновика уже опубликован. Проверьте «Мои заказы»; если его там нет, опубликуйте ещё раз.';

/** Правка устаревшей формы (заказ изменён в другой вкладке): ответ 409 без изменений. */
export const JOB_CHANGED_ELSEWHERE =
  'Заказ изменён в другой вкладке или окне. Обновите страницу, чтобы увидеть изменения, и внесите правку ещё раз.';

/** Повтор ключа публикации с другим содержимым (ТЗ #40, п. 6). */
export const REQUEST_KEY_REUSED =
  'Этот заказ уже был отправлен с другими данными. Проверьте «Мои заказы»: если заказа там нет, обновите страницу и опубликуйте ещё раз.';

/** Отпечаток содержимого: JSON с упорядоченными ключами, SHA-256. */
function publishFingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
              .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

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
    const requestHash = dto.requestId
      ? publishFingerprint({ ...dto, requestId: undefined, details, extraItems })
      : null;

    const job = await this.prisma.$transaction(async (tx) => {
      // Блокировка строки пользователя сериализует создание заказов одним пользователем:
      // параллельные запросы считают квоту по очереди и не могут превысить её.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
      // Повтор того же запроса (двойной клик, повтор после обрыва связи) с тем же ключом формы:
      // возвращается уже созданный заказ, второй не создаётся. Под блокировкой пользователя
      // параллельные повторы идут по очереди и находят первый (AUDIT_FINDINGS MVP-1).
      // Тот же ключ с другим содержимым — не повтор, а другая операция: 409, а не молча
      // прежний заказ (ТЗ #40, п. 6). Ключ действует только в пределах владельца.
      if (dto.requestId) {
        const existing = await tx.job.findUnique({
          where: { ownerId_requestId: { ownerId, requestId: dto.requestId } },
        });
        if (existing) {
          if (existing.requestHash !== null && existing.requestHash !== requestHash) {
            throw new ConflictException(REQUEST_KEY_REUSED);
          }
          return existing;
        }
      }
      const window = { ownerId, createdAt: { gt: new Date(Date.now() - DAY_MS) } };
      const createdToday = await tx.job.count({ where: window });
      if (createdToday >= JOB_LIMITS.CREATED_PER_DAY) {
        const oldest = await tx.job.findFirst({
          where: window,
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        });
        throw new QuotaExceeded(
          `Можно создать не больше ${JOB_LIMITS.CREATED_PER_DAY} заказов за сутки`,
          oldest?.createdAt,
          DAY_MS,
        );
      }

      // Опубликован из черновика: черновик удаляется в этой же транзакции до создания заказа.
      // Если его уже нет (опубликован в другой вкладке, повтор запроса после обрыва связи, чужой
      // id), второй заказ не создаётся. Строка пользователя заблокирована выше, поэтому
      // параллельные публикации идут по очереди и только первая находит черновик.
      if (dto.draftId) {
        const { count } = await tx.jobDraft.deleteMany({ where: { id: dto.draftId, ownerId } });
        if (count === 0) throw new ConflictException(DRAFT_ALREADY_PUBLISHED);
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
          requestId: dto.requestId ?? null,
          requestHash,
        },
      });
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
        throw new ApiError(409, 'JOB_NOT_OPEN', 'Редактировать можно только открытый заказ');
      }
      // Форма открыта на старой версии (заказ изменён в другой вкладке или окне): правка не
      // применяется, иначе она молча затёрла бы чужие изменения (MVP-2).
      if (
        dto.expectedUpdatedAt !== undefined &&
        new Date(dto.expectedUpdatedAt).getTime() !== current.updatedAt.getTime()
      ) {
        throw new ConflictException(JOB_CHANGED_ELSEWHERE);
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
        throw new ApiError(400, 'NO_FIELDS_TO_UPDATE', 'Нет полей для изменения');
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
        // Заказ изменён после откликов: подрядчики видят пометку на своих ожидающих откликах,
        // заказчик — что отклик дан до изменения (решение владельца по MVP-3).
        await tx.bid.updateMany({
          where: { jobId: id, status: 'PENDING' },
          data: { jobChangedAt: updated.updatedAt },
        });
      }
      return updated;
    });
    return toOwnJobDto(job);
  }

  /**
   * Закрытие с исходом. Открытый заказ (исполнитель не выбран) можно только отменить; у заказа
   * в работе исход обязателен: «выполнен» или «отменён» (AUDIT_FINDINGS MVP-5).
   */
  async close(ownerId: string, id: string, outcome?: JobCloseOutcome): Promise<OwnJobDto> {
    const job = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockOwned(tx, ownerId, id);
      if (current.status === 'CLOSED')
        throw new ApiError(409, 'JOB_ALREADY_CLOSED', 'Заказ уже закрыт');
      if (current.status === 'OPEN' && outcome === 'COMPLETED') {
        throw new ConflictException(
          'Исполнитель не выбран: заказ можно только отменить. Выберите исполнителя, чтобы завершить заказ',
        );
      }
      if (current.status === 'IN_PROGRESS' && !outcome) {
        throw new BadRequestException('Укажите, чем закончился заказ: выполнен или отменён');
      }
      const closed = await tx.job.update({
        where: { id },
        data: { status: 'CLOSED', closeOutcome: outcome ?? 'CANCELLED' },
      });
      // Ожидающие отклики закрытого заказа больше не могут быть выбраны.
      await this.bids.rejectPending(tx, ownerId, id, null, 'JOB_CLOSED');
      await writeAudit(tx, {
        actorId: ownerId,
        action: 'JOB_CLOSED',
        entityType: 'job',
        entityId: id,
        changes: diffFields(current, closed, ['status', 'closeOutcome']),
      });
      if (current.status === 'IN_PROGRESS') {
        const accepted = await tx.bid.findFirst({
          where: { jobId: id, status: 'ACCEPTED' },
          select: { contractorId: true },
        });
        await notify(tx, {
          actorId: ownerId,
          userId: accepted?.contractorId ?? null,
          jobId: id,
          kind: 'JOB_CLOSED',
          data: { outcome: closed.closeOutcome ?? 'CANCELLED' },
        });
      }
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
    throw new ApiError(
      400,
      'BUDGET_RANGE_INVALID',
      'Минимальный бюджет не может быть больше максимального',
    );
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
