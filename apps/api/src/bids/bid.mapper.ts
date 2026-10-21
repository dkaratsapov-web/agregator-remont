import type { BidDto, ContractorRatingDto, JobBidDto, MyBidDto } from '@agregator/shared';
import type { Bid, ContractorProfile, Job, User } from '@prisma/client';
import { toProfileDto } from '../contractors/profile.mapper';

export function toBidDto(bid: Bid): BidDto {
  return {
    id: bid.id,
    jobId: bid.jobId,
    status: bid.status,
    price: bid.price,
    durationDays: bid.durationDays,
    comment: bid.comment,
    createdAt: bid.createdAt.toISOString(),
    jobChangedAt: bid.jobChangedAt?.toISOString() ?? null,
    rejectReason: bid.rejectReason,
  };
}

export function toMyBidDto(bid: Bid & { job: Job }): MyBidDto {
  return {
    ...toBidDto(bid),
    job: {
      id: bid.job.id,
      title: bid.job.title,
      city: bid.job.city,
      status: bid.job.status,
      closeOutcome: bid.job.closeOutcome,
    },
  };
}

/** Для владельца заказа: имя, профиль и рейтинг подрядчика, без email и id пользователя. */
export function toJobBidDto(
  bid: Bid & { contractor: User & { profile: ContractorProfile | null } },
  rating: ContractorRatingDto,
): JobBidDto {
  return {
    ...toBidDto(bid),
    contractor: {
      publicId: bid.contractor.publicId,
      name: bid.contractor.name,
      profile: bid.contractor.profile ? toProfileDto(bid.contractor.profile) : null,
      rating,
    },
  };
}
