import type { BidDto, JobBidDto, MyBidDto } from '@agregator/shared';
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
  };
}

export function toMyBidDto(bid: Bid & { job: Job }): MyBidDto {
  return {
    ...toBidDto(bid),
    job: { id: bid.job.id, title: bid.job.title, city: bid.job.city, status: bid.job.status },
  };
}

/** Для владельца заказа: имя и профиль подрядчика, без email и id пользователя. */
export function toJobBidDto(
  bid: Bid & { contractor: User & { profile: ContractorProfile | null } },
): JobBidDto {
  return {
    ...toBidDto(bid),
    contractor: {
      name: bid.contractor.name,
      profile: bid.contractor.profile ? toProfileDto(bid.contractor.profile) : null,
    },
  };
}
