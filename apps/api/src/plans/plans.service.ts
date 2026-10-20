import type { JobPlanDto, PlanParty } from '@agregator/shared';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAudit } from '../audit/audit';
import { ENTITY_ID_PATTERN } from '../common/text';
import type { ProcessedPhoto } from '../photos/photo-processing';
import { PHOTO_SELECT, PhotosService } from '../photos/photos.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PlanAuthorDto,
  PlanCommentDto,
  PlanVersionDto,
  QuitJobDto,
  ReturnPlanDto,
  SavePlanDto,
} from './dto/plan.dto';
import { findDeal, type Deal } from './deal';
import { toPlanDto, type PlanWithStages } from './plan.mapper';

const STAGE_NOT_FOUND = 'Этап не найден';
const STALE = 'План изменился, пока вы его смотрели: обновите страницу';
const PARTY_LABEL: Record<PlanParty, string> = { OWNER: 'заказчик', CONTRACTOR: 'исполнитель' };

/**
 * План работ и этапы (packages/shared/src/plans.ts). Стороны сделки — заказчик-владелец и
 * исполнитель с выбранным откликом; остальным заказ неотличим от несуществующего (404).
 *
 * Каждое изменение — в транзакции под блокировкой строки заказа (FOR UPDATE), как выбор
 * исполнителя и закрытие: изменения плана, этапов, отказ исполнителя и закрытие заказа
 * выполняются по очереди. Повтор того же перехода (двойной клик, обрыв связи) возвращает
 * текущее состояние; переход из другого состояния — 409.
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: PhotosService,
  ) {}

  async get(userId: string, jobId: string): Promise<JobPlanDto> {
    const deal = await this.findDeal(this.prisma, userId, jobId, false);
    return toPlanDto(jobId, await this.loadPlan(this.prisma, jobId), deal.viewer);
  }

  /** Черновик плана целиком: только составитель и только пока план не отправлен. */
  save(userId: string, jobId: string, dto: SavePlanDto): Promise<JobPlanDto> {
    return this.mutate(userId, jobId, async (tx, deal, plan) => {
      this.requireAuthor(deal, plan);
      if (plan && plan.status !== 'DRAFT') {
        throw new ConflictException('План уже отправлен на согласование: менять его нельзя');
      }
      this.requireVersion(plan, dto);
      const stages = dto.stages.map((stage, index) => ({
        position: index + 1,
        title: stage.title,
        description: stage.description,
        durationDays: stage.durationDays,
      }));
      let saved: PlanWithStages;
      if (plan) {
        await tx.jobStage.deleteMany({ where: { planId: plan.id } });
        saved = await tx.jobPlan.update({
          where: { id: plan.id },
          data: {
            sequential: dto.sequential,
            version: { increment: 1 },
            stages: { create: stages },
          },
          include: { stages: true },
        });
      } else {
        saved = await tx.jobPlan.create({
          data: { jobId, sequential: dto.sequential, stages: { create: stages } },
          include: { stages: true },
        });
      }
      await this.audit(tx, userId, 'PLAN_SAVED', jobId, {
        version: { from: plan?.version ?? 0, to: saved.version },
        stages: { from: plan?.stages.length ?? 0, to: stages.length },
        sequential: { from: plan?.sequential ?? null, to: dto.sequential },
      });
      return saved;
    });
  }

  /** Кто составляет план: решает заказчик, пока план не отправлен. */
  setAuthor(userId: string, jobId: string, dto: PlanAuthorDto): Promise<JobPlanDto> {
    return this.mutate(userId, jobId, async (tx, deal, plan) => {
      if (deal.viewer !== 'OWNER') {
        throw new ForbiddenException('Кто составляет план, решает заказчик');
      }
      if ((plan?.author ?? 'CONTRACTOR') === dto.author) return plan;
      if (plan && plan.status !== 'DRAFT') {
        throw new ConflictException('План уже отправлен на согласование: составителя не сменить');
      }
      this.requireVersion(plan, dto);
      const saved = plan
        ? await tx.jobPlan.update({
            where: { id: plan.id },
            data: { author: dto.author, version: { increment: 1 } },
            include: { stages: true },
          })
        : await tx.jobPlan.create({
            data: { jobId, author: dto.author },
            include: { stages: true },
          });
      await this.audit(tx, userId, 'PLAN_AUTHOR_CHANGED', jobId, {
        author: { from: plan?.author ?? 'CONTRACTOR', to: dto.author },
      });
      return saved;
    });
  }

  /** Составитель отправляет план на согласование. */
  propose(userId: string, jobId: string, dto: PlanVersionDto): Promise<JobPlanDto> {
    return this.mutate(userId, jobId, async (tx, deal, plan) => {
      this.requireAuthor(deal, plan);
      if (plan?.status === 'PROPOSED' && plan.version === dto.version + 1) return plan;
      if (!plan || plan.stages.length === 0) {
        throw new ConflictException('Добавьте в план хотя бы один этап');
      }
      if (plan.status !== 'DRAFT') {
        throw new ConflictException('План уже отправлен на согласование');
      }
      this.requireVersion(plan, dto);
      const saved = await tx.jobPlan.update({
        where: { id: plan.id },
        data: { status: 'PROPOSED', proposedAt: new Date(), version: { increment: 1 } },
        include: { stages: true },
      });
      await this.audit(tx, userId, 'PLAN_PROPOSED', jobId, {
        status: { from: 'DRAFT', to: 'PROPOSED' },
        version: { from: plan.version, to: saved.version },
      });
      return saved;
    });
  }

  /** Другая сторона согласует отправленный план. */
  approve(userId: string, jobId: string, dto: PlanVersionDto): Promise<JobPlanDto> {
    return this.mutate(userId, jobId, async (tx, deal, plan) => {
      this.requireCounterparty(deal, plan);
      if (plan?.status === 'APPROVED' && plan.version === dto.version + 1) return plan;
      if (plan?.status !== 'PROPOSED') {
        throw new ConflictException('Согласовать можно только план, отправленный на согласование');
      }
      this.requireVersion(plan, dto);
      const saved = await tx.jobPlan.update({
        where: { id: plan.id },
        data: { status: 'APPROVED', approvedAt: new Date(), version: { increment: 1 } },
        include: { stages: true },
      });
      await this.audit(tx, userId, 'PLAN_APPROVED', jobId, {
        status: { from: 'PROPOSED', to: 'APPROVED' },
        version: { from: plan.version, to: saved.version },
      });
      return saved;
    });
  }

  /** Другая сторона возвращает план составителю с причиной. */
  returnPlan(userId: string, jobId: string, dto: ReturnPlanDto): Promise<JobPlanDto> {
    return this.mutate(userId, jobId, async (tx, deal, plan) => {
      this.requireCounterparty(deal, plan);
      if (
        plan?.status === 'DRAFT' &&
        plan.returnReason === dto.reason &&
        plan.version === dto.version + 1
      ) {
        return plan;
      }
      if (plan?.status !== 'PROPOSED') {
        throw new ConflictException('Вернуть можно только план, отправленный на согласование');
      }
      this.requireVersion(plan, dto);
      const saved = await tx.jobPlan.update({
        where: { id: plan.id },
        data: { status: 'DRAFT', returnReason: dto.reason, version: { increment: 1 } },
        include: { stages: true },
      });
      await this.audit(tx, userId, 'PLAN_RETURNED', jobId, {
        status: { from: 'PROPOSED', to: 'DRAFT' },
        returnReason: { from: plan.returnReason, to: dto.reason },
      });
      return saved;
    });
  }

  /**
   * Исполнитель сдаёт этап (по порядку, если так согласовано) с комментарием и фото-отчётом:
   * фото перекодированы до транзакции (PhotosService.prepare). Повтор той же сдачи фото не
   * добавляет.
   */
  submitStage(
    userId: string,
    jobId: string,
    stageId: string,
    dto: PlanCommentDto,
    photos: ProcessedPhoto[] = [],
  ): Promise<JobPlanDto> {
    return this.mutate(userId, jobId, async (tx, deal, plan) => {
      if (deal.viewer !== 'CONTRACTOR') throw new ForbiddenException('Этапы сдаёт исполнитель');
      const stage = this.findStage(plan, stageId);
      if (stage.status === 'SUBMITTED' && stage.submitComment === dto.comment) return plan;
      if (plan?.status !== 'APPROVED') {
        throw new ConflictException('Этапы сдаются после согласования плана');
      }
      if (stage.status !== 'PLANNED' && stage.status !== 'REWORK') {
        throw new ConflictException(
          stage.status === 'SUBMITTED' ? 'Этап уже сдан и ждёт проверки' : 'Этап уже принят',
        );
      }
      if (plan.sequential) {
        const earlier = plan.stages.filter((other) => other.position < stage.position);
        if (earlier.some((other) => other.status !== 'ACCEPTED')) {
          throw new ConflictException(
            'Этапы сдаются по порядку: сначала должны быть приняты предыдущие',
          );
        }
      }
      await tx.jobStage.update({
        where: { id: stage.id },
        data: { status: 'SUBMITTED', submitComment: dto.comment, submittedAt: new Date() },
      });
      await this.photos.attach(
        tx,
        { jobId, contractorId: deal.contractorId, uploaderId: userId, stageId: stage.id },
        photos,
      );
      await this.audit(
        tx,
        userId,
        'STAGE_SUBMITTED',
        stage.id,
        {
          jobId: { from: null, to: jobId },
          status: { from: stage.status, to: 'SUBMITTED' },
          photos: { from: null, to: photos.length },
        },
        'job_stage',
      );
      return this.loadPlan(tx, jobId);
    });
  }

  /** Заказчик принимает сданный этап. */
  acceptStage(userId: string, jobId: string, stageId: string): Promise<JobPlanDto> {
    return this.mutate(userId, jobId, async (tx, deal, plan) => {
      if (deal.viewer !== 'OWNER') throw new ForbiddenException('Этапы принимает заказчик');
      const stage = this.findStage(plan, stageId);
      if (stage.status === 'ACCEPTED') return plan;
      if (stage.status !== 'SUBMITTED') {
        throw new ConflictException('Принять можно только сданный этап');
      }
      await tx.jobStage.update({
        where: { id: stage.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      await this.audit(
        tx,
        userId,
        'STAGE_ACCEPTED',
        stage.id,
        {
          jobId: { from: null, to: jobId },
          status: { from: 'SUBMITTED', to: 'ACCEPTED' },
        },
        'job_stage',
      );
      return this.loadPlan(tx, jobId);
    });
  }

  /** Заказчик возвращает сданный этап на доработку с комментарием. */
  reworkStage(
    userId: string,
    jobId: string,
    stageId: string,
    dto: PlanCommentDto,
  ): Promise<JobPlanDto> {
    return this.mutate(userId, jobId, async (tx, deal, plan) => {
      if (deal.viewer !== 'OWNER') {
        throw new ForbiddenException('На доработку этап возвращает заказчик');
      }
      const stage = this.findStage(plan, stageId);
      if (stage.status === 'REWORK' && stage.reworkComment === dto.comment) return plan;
      if (stage.status !== 'SUBMITTED') {
        throw new ConflictException('На доработку можно вернуть только сданный этап');
      }
      await tx.jobStage.update({
        where: { id: stage.id },
        data: { status: 'REWORK', reworkComment: dto.comment },
      });
      await this.audit(
        tx,
        userId,
        'STAGE_REWORK',
        stage.id,
        {
          jobId: { from: null, to: jobId },
          status: { from: 'SUBMITTED', to: 'REWORK' },
          reworkComment: { from: stage.reworkComment, to: dto.comment },
        },
        'job_stage',
      );
      return this.loadPlan(tx, jobId);
    });
  }

  /**
   * Исполнитель отказывается от заказа: его отклик — отозван, заказ снова открыт, отклики,
   * отклонённые из-за его выбора, — снова на рассмотрении (заказчик может выбрать другого),
   * план удаляется (история — в журнале).
   */
  async quit(userId: string, jobId: string, dto: QuitJobDto): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const deal = await this.findDeal(tx, userId, jobId, true);
      if (deal.viewer !== 'CONTRACTOR') {
        throw new ForbiddenException('Отказаться от заказа может только выбранный исполнитель');
      }
      if (deal.status !== 'IN_PROGRESS') throw new ConflictException('Заказ не в работе');

      await tx.bid.update({ where: { id: deal.acceptedBidId }, data: { status: 'WITHDRAWN' } });
      await writeAudit(tx, {
        actorId: userId,
        action: 'BID_WITHDRAWN',
        entityType: 'bid',
        entityId: deal.acceptedBidId,
        changes: { status: { from: 'ACCEPTED', to: 'WITHDRAWN' } },
      });
      const reopened = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM bids
        WHERE job_id = ${jobId} AND status = 'REJECTED'::"BidStatus"
          AND reject_reason = 'OTHER_ACCEPTED'::"BidRejectReason"
        ORDER BY id
        FOR UPDATE`;
      if (reopened.length > 0) {
        await tx.bid.updateMany({
          where: { id: { in: reopened.map((bid) => bid.id) } },
          data: { status: 'PENDING', rejectReason: null },
        });
      }
      await tx.jobPlan.deleteMany({ where: { jobId } });
      await tx.job.update({ where: { id: jobId }, data: { status: 'OPEN' } });
      await this.audit(tx, userId, 'CONTRACTOR_QUIT', jobId, {
        status: { from: 'IN_PROGRESS', to: 'OPEN' },
        reason: { from: null, to: dto.reason },
        reopenedBids: { from: null, to: reopened.map((bid) => bid.id) },
      });
    });
  }

  // --- общее

  private async mutate(
    userId: string,
    jobId: string,
    change: (
      tx: Prisma.TransactionClient,
      deal: Deal,
      plan: PlanWithStages | null,
    ) => Promise<PlanWithStages | null>,
  ): Promise<JobPlanDto> {
    return this.prisma.$transaction(async (tx) => {
      const deal = await this.findDeal(tx, userId, jobId, true);
      if (deal.status !== 'IN_PROGRESS') {
        throw new ConflictException('План меняется только у заказа в работе');
      }
      const plan = await this.loadPlan(tx, jobId);
      const result = await change(tx, deal, plan);
      return toPlanDto(jobId, result, deal.viewer);
    });
  }

  private findDeal(
    db: Prisma.TransactionClient,
    userId: string,
    jobId: string,
    lock: boolean,
  ): Promise<Deal> {
    return findDeal(db, userId, jobId, lock, 'План появится после выбора исполнителя');
  }

  private loadPlan(db: Prisma.TransactionClient, jobId: string): Promise<PlanWithStages | null> {
    return db.jobPlan.findUnique({
      where: { jobId },
      include: {
        stages: {
          orderBy: { position: 'asc' },
          include: {
            photos: { select: PHOTO_SELECT, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
          },
        },
      },
    });
  }

  private requireAuthor(deal: Deal, plan: PlanWithStages | null): void {
    const author = plan?.author ?? 'CONTRACTOR';
    if (deal.viewer !== author) {
      throw new ForbiddenException(`План составляет ${PARTY_LABEL[author]}`);
    }
  }

  private requireCounterparty(deal: Deal, plan: PlanWithStages | null): void {
    const author = plan?.author ?? 'CONTRACTOR';
    if (deal.viewer === author) {
      throw new ForbiddenException('Согласует план другая сторона');
    }
  }

  private requireVersion(plan: PlanWithStages | null, dto: PlanVersionDto): void {
    if ((plan?.version ?? 0) !== dto.version) throw new ConflictException(STALE);
  }

  private findStage(plan: PlanWithStages | null, stageId: string) {
    const stage = ENTITY_ID_PATTERN.test(stageId)
      ? plan?.stages.find((candidate) => candidate.id === stageId)
      : undefined;
    if (!stage) throw new NotFoundException(STAGE_NOT_FOUND);
    return stage;
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: Parameters<typeof writeAudit>[1]['action'],
    entityId: string,
    changes: Parameters<typeof writeAudit>[1]['changes'],
    entityType: 'job' | 'job_stage' = 'job',
  ) {
    return writeAudit(tx, { actorId, action, entityType, entityId, changes });
  }
}
