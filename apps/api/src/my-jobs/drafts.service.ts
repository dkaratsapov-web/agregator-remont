import { DRAFT_LIMITS, type JobDraftDto } from '@agregator/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ENTITY_ID_PATTERN } from '../common/text';
import { UsageCounters } from '../analytics/usage';
import { PrismaService } from '../prisma/prisma.service';
import { draftDetails, draftItems, toJobDraftDto } from './draft.mapper';
import { SaveDraftDto } from './dto/draft-input.dto';
import { lockActiveUser } from '../users/lock-user';

const NOT_FOUND = 'Черновик не найден';

/**
 * Черновики заказчика. Как и заказы, ограничены владельцем: чужой черновик неотличим от
 * несуществующего (404). Черновик не участвует в каталоге и откликах; в журнал аудита не
 * пишется (виден только владельцу), публикация пишет обычное JOB_CREATED.
 */
@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageCounters,
  ) {}

  async list(ownerId: string): Promise<JobDraftDto[]> {
    const drafts = await this.prisma.jobDraft.findMany({
      where: { ownerId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: DRAFT_LIMITS.MAX_PER_USER,
    });
    return drafts.map(toJobDraftDto);
  }

  async get(ownerId: string, id: string): Promise<JobDraftDto> {
    return toJobDraftDto(await this.findOwned(this.prisma, ownerId, id));
  }

  async create(ownerId: string, dto: SaveDraftDto): Promise<JobDraftDto> {
    const draft = await this.prisma.$transaction(async (tx) => {
      // Блокировка строки пользователя: параллельные сохранения не превысят лимит черновиков.
      await lockActiveUser(tx, ownerId);
      const count = await tx.jobDraft.count({ where: { ownerId } });
      if (count >= DRAFT_LIMITS.MAX_PER_USER) {
        throw new ConflictException(
          `Можно хранить не больше ${DRAFT_LIMITS.MAX_PER_USER} черновиков. Удалите ненужные или опубликуйте заказ.`,
        );
      }
      return tx.jobDraft.create({ data: { ...toData(dto), ownerId } });
    });
    this.usage.add('DRAFTS_STARTED');
    return toJobDraftDto(draft);
  }

  /** Полная замена содержимого: черновик сохраняется формой целиком. */
  async replace(ownerId: string, id: string, dto: SaveDraftDto): Promise<JobDraftDto> {
    const where = { id: ENTITY_ID_PATTERN.test(id) ? id : '', ownerId };
    if (dto.expectedUpdatedAt === undefined) {
      const { count } = await this.prisma.jobDraft.updateMany({ where, data: toData(dto) });
      if (count === 0) throw new NotFoundException(NOT_FOUND);
      return this.get(ownerId, id);
    }
    // Форма знает версию черновика: замена — только если его не изменили в другой вкладке
    // (условие в самом UPDATE, без гонки между проверкой и записью; MVP-6).
    const { count } = await this.prisma.jobDraft.updateMany({
      where: { ...where, updatedAt: new Date(dto.expectedUpdatedAt) },
      data: toData(dto),
    });
    if (count === 0) {
      if ((await this.prisma.jobDraft.count({ where })) === 0) {
        throw new NotFoundException(NOT_FOUND);
      }
      throw new ConflictException(
        'Черновик изменён в другой вкладке. Обновите страницу, чтобы не потерять изменения.',
      );
    }
    return this.get(ownerId, id);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const { count } = await this.prisma.jobDraft.deleteMany({
      where: { id: ENTITY_ID_PATTERN.test(id) ? id : '', ownerId },
    });
    if (count === 0) throw new NotFoundException(NOT_FOUND);
  }

  private async findOwned(db: Prisma.TransactionClient, ownerId: string, id: string) {
    const draft = ENTITY_ID_PATTERN.test(id)
      ? await db.jobDraft.findFirst({ where: { id, ownerId } })
      : null;
    if (!draft) throw new NotFoundException(NOT_FOUND);
    return draft;
  }
}

/** Явный список полей: владелец и даты задаются только сервером. */
function toData(dto: SaveDraftDto) {
  const category = dto.category ?? null;
  return {
    title: dto.title ?? null,
    description: dto.description ?? null,
    category,
    city: dto.city ?? null,
    budgetMin: dto.budgetMin ?? null,
    budgetMax: dto.budgetMax ?? null,
    details: draftDetails(category, dto.details) as Prisma.InputJsonObject,
    extraItems: draftItems(category, dto.extraItems) as unknown as Prisma.InputJsonArray,
  };
}
