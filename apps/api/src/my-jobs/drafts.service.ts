import { DRAFT_LIMITS, type JobDraftDto } from '@agregator/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ENTITY_ID_PATTERN } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import { draftDetails, toJobDraftDto } from './draft.mapper';
import { SaveDraftDto } from './dto/draft-input.dto';

const NOT_FOUND = 'Черновик не найден';

/**
 * Черновики заказчика. Как и заказы, ограничены владельцем: чужой черновик неотличим от
 * несуществующего (404). Черновик не участвует в каталоге и откликах; в журнал аудита не
 * пишется (виден только владельцу), публикация пишет обычное JOB_CREATED.
 */
@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService) {}

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
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
      const count = await tx.jobDraft.count({ where: { ownerId } });
      if (count >= DRAFT_LIMITS.MAX_PER_USER) {
        throw new ConflictException(
          `Можно хранить не больше ${DRAFT_LIMITS.MAX_PER_USER} черновиков. Удалите ненужные или опубликуйте заказ.`,
        );
      }
      return tx.jobDraft.create({ data: { ...toData(dto), ownerId } });
    });
    return toJobDraftDto(draft);
  }

  /** Полная замена содержимого: черновик сохраняется формой целиком. */
  async replace(ownerId: string, id: string, dto: SaveDraftDto): Promise<JobDraftDto> {
    const { count } = await this.prisma.jobDraft.updateMany({
      where: { id: ENTITY_ID_PATTERN.test(id) ? id : '', ownerId },
      data: toData(dto),
    });
    if (count === 0) throw new NotFoundException(NOT_FOUND);
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
  };
}
