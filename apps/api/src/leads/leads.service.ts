import {
  LEAD_LIMITS,
  normalizeRuPhone,
  PRIVACY_POLICY_VERSION,
  type LeadDto,
  type Paginated,
} from '@agregator/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAudit } from '../audit/audit';
import { ENTITY_ID_PATTERN } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { ListLeadsQuery } from './dto/admin-leads.dto';
import { toLeadDto } from './lead.mapper';
import { LEADS_ENABLED } from './leads.config';
import { QuotaExceeded } from '../common/api-error';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ключ advisory-блокировки: заявки записываются по одной (их мало), без гонок за лимитом. */
const LEADS_LOCK_KEY = 4_810_001;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LEADS_ENABLED) private readonly enabled: boolean,
  ) {}

  /**
   * Приём заявки. Ответ одинаковый для новой заявки, повтора того же номера за сутки и
   * сработавшей ловушки для ботов: так бот не узнаёт, что его отсеяли, а повтор не дублирует запись.
   */
  async create(dto: CreateLeadDto): Promise<void> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Приём заявок скоро откроется');
    }
    if (dto.website) return;

    const phone = normalizeRuPhone(dto.phone);
    if (!phone) {
      throw new BadRequestException('Укажите российский номер телефона, например +7 900 123-45-67');
    }

    const since = new Date(Date.now() - DAY_MS);
    // Блокировка на транзакцию: суточный лимит и проверка повтора не обходятся параллельными
    // запросами (заявок мало, последовательная запись не мешает).
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEADS_LOCK_KEY})`;
      const repeated = await tx.lead.findFirst({
        where: { phone, createdAt: { gt: since } },
        select: { id: true },
      });
      if (repeated) return;
      const today = await tx.lead.count({ where: { createdAt: { gt: since } } });
      if (today >= LEAD_LIMITS.PER_DAY_MAX) {
        const oldest = await tx.lead.findFirst({
          where: { createdAt: { gt: since } },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        });
        throw new QuotaExceeded(
          'Сейчас слишком много заявок, попробуйте завтра',
          oldest?.createdAt,
          DAY_MS,
        );
      }
      await tx.lead.create({
        data: { name: dto.name, phone, consentVersion: PRIVACY_POLICY_VERSION },
      });
    });
  }

  async list(query: ListLeadsQuery): Promise<Paginated<LeadDto>> {
    const { page, limit, status } = query;
    const where: Prisma.LeadWhereInput =
      status === 'new'
        ? { processedAt: null }
        : status === 'processed'
          ? { processedAt: { not: null } }
          : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { items: items.map(toLeadDto), page, limit, total };
  }

  async setProcessed(adminId: string, id: string, processed: boolean): Promise<LeadDto> {
    if (!ENTITY_ID_PATTERN.test(id)) throw new NotFoundException('Заявка не найдена');
    return this.prisma.$transaction(async (tx) => {
      // Строка заявки блокируется до конца транзакции: два администратора, нажавшие
      // одновременно, меняют её по очереди, и второй видит уже обработанную заявку
      // (одна запись в журнале, AUDIT_FINDINGS ARCH-5).
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM leads WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Заявка не найдена');
      const before = await tx.lead.findUniqueOrThrow({ where: { id } });
      if ((before.processedAt !== null) === processed) return toLeadDto(before);
      const after = await tx.lead.update({
        where: { id },
        data: { processedAt: processed ? new Date() : null },
      });
      await writeAudit(tx, {
        actorId: adminId,
        action: processed ? 'LEAD_PROCESSED' : 'LEAD_REOPENED',
        entityType: 'lead',
        entityId: id,
        changes: {
          processedAt: {
            from: before.processedAt?.toISOString() ?? null,
            to: after.processedAt?.toISOString() ?? null,
          },
        },
      });
      return toLeadDto(after);
    });
  }
}
