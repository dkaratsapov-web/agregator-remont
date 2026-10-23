import {
  REVIEW_LIMITS,
  type JobReviewStateDto,
  type PublicContractorDto,
  type ReviewDto,
} from '@agregator/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { writeAudit } from '../audit/audit';
import { ENTITY_ID_PATTERN } from '../common/text';
import { toProfileDto } from '../contractors/profile.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { ContractorReviewsQuery, CreateReviewDto } from './dto/review.dto';
import { ratingsFor } from './ratings';

const JOB_NOT_FOUND = 'Заказ не найден';
const CONTRACTOR_NOT_FOUND = 'Мастер не найден';
const REVIEW_SELECT = {
  id: true,
  rating: true,
  text: true,
  createdAt: true,
  author: { select: { name: true } },
  job: { select: { title: true } },
} as const;

function toReviewDto(row: Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>): ReviewDto {
  return {
    id: row.id,
    rating: row.rating,
    text: row.text,
    authorName: row.author.name,
    jobTitle: row.job.title,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Отзывы: заказчик оценивает исполнителя после того, как закрыл заказ как выполненный. Один
 * отзыв на заказ, без правки (повтор — 409). Публичная карточка мастера — без контактов.
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async state(ownerId: string, jobId: string): Promise<JobReviewStateDto> {
    const job = await this.ownedJob(this.prisma, ownerId, jobId);
    const [contractor, review] = await Promise.all([
      this.doneWith(this.prisma, job),
      this.prisma.review.findUnique({ where: { jobId }, select: REVIEW_SELECT }),
    ]);
    return {
      canReview: !!contractor && !review,
      review: review ? toReviewDto(review) : null,
      contractor: contractor ? { publicId: contractor.publicId, name: contractor.name } : null,
    };
  }

  async create(ownerId: string, jobId: string, dto: CreateReviewDto): Promise<ReviewDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      // Под блокировкой заказа: два одновременных отзыва на один заказ не пройдут.
      if (!ENTITY_ID_PATTERN.test(jobId)) throw new NotFoundException(JOB_NOT_FOUND);
      await tx.$queryRaw`SELECT id FROM jobs WHERE id = ${jobId} AND owner_id = ${ownerId} FOR UPDATE`;
      const job = await this.ownedJob(tx, ownerId, jobId);
      const contractor = await this.doneWith(tx, job);
      if (!contractor) {
        throw new ConflictException('Отзыв можно оставить после закрытия заказа как выполненного');
      }
      if (await tx.review.findUnique({ where: { jobId }, select: { id: true } })) {
        throw new ConflictException('Отзыв по этому заказу уже оставлен');
      }
      const created = await tx.review.create({
        data: {
          jobId,
          authorId: ownerId,
          contractorId: contractor.id,
          rating: dto.rating,
          text: dto.text,
        },
        select: REVIEW_SELECT,
      });
      await writeAudit(tx, {
        actorId: ownerId,
        action: 'REVIEW_CREATED',
        entityType: 'review',
        entityId: created.id,
        changes: { jobId: { from: null, to: jobId }, rating: { from: null, to: dto.rating } },
      });
      return created;
    });
    return toReviewDto(row);
  }

  async contractor(publicId: number, query: ContractorReviewsQuery): Promise<PublicContractorDto> {
    if (publicId < 1 || publicId > 2_147_483_647) throw new NotFoundException(CONTRACTOR_NOT_FOUND);
    const user = await this.prisma.user.findUnique({
      where: { publicId },
      select: {
        id: true,
        publicId: true,
        name: true,
        role: true,
        blockedAt: true,
        createdAt: true,
        profile: true,
      },
    });
    // Заблокированные и не подрядчики — как несуществующие.
    if (!user || user.role !== 'CONTRACTOR' || user.blockedAt) {
      throw new NotFoundException(CONTRACTOR_NOT_FOUND);
    }
    const limit = REVIEW_LIMITS.PAGE;
    const [ratings, completedJobs, reviews] = await Promise.all([
      ratingsFor(this.prisma, [user.id]),
      this.prisma.bid.count({
        where: {
          contractorId: user.id,
          status: 'ACCEPTED',
          job: { status: 'CLOSED', closeOutcome: 'COMPLETED' },
        },
      }),
      this.prisma.review.findMany({
        where: { contractorId: user.id, hiddenAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * limit,
        take: limit + 1,
        select: REVIEW_SELECT,
      }),
    ]);
    return {
      publicId: user.publicId,
      name: user.name,
      profile: user.profile ? toProfileDto(user.profile) : null,
      rating: ratings.get(user.id)!,
      completedJobs,
      memberSince: user.createdAt.toISOString(),
      reviews: reviews.slice(0, limit).map(toReviewDto),
      hasMoreReviews: reviews.length > limit,
    };
  }

  private async ownedJob(db: Prisma.TransactionClient, ownerId: string, jobId: string) {
    if (!ENTITY_ID_PATTERN.test(jobId)) throw new NotFoundException(JOB_NOT_FOUND);
    const job = await db.job.findFirst({
      where: { id: jobId, ownerId },
      select: { id: true, status: true, closeOutcome: true },
    });
    if (!job) throw new NotFoundException(JOB_NOT_FOUND);
    return job;
  }

  /** Исполнитель выполненного заказа; null — заказ не закрыт как выполненный или без исполнителя. */
  private async doneWith(
    db: Prisma.TransactionClient,
    job: { id: string; status: string; closeOutcome: string | null },
  ) {
    if (job.status !== 'CLOSED' || job.closeOutcome !== 'COMPLETED') return null;
    const bid = await db.bid.findFirst({
      where: { jobId: job.id, status: 'ACCEPTED' },
      select: { contractor: { select: { id: true, publicId: true, name: true } } },
    });
    return bid?.contractor ?? null;
  }
}
