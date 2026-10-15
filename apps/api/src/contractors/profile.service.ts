import type { ContractorProfileDto } from '@agregator/shared';
import { Injectable } from '@nestjs/common';
import { writeAudit } from '../audit/audit';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertProfileDto } from './dto/profile.dto';
import { toProfileDto } from './profile.mapper';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<ContractorProfileDto> {
    return toProfileDto(await this.prisma.contractorProfile.findUnique({ where: { userId } }));
  }

  async upsert(userId: string, dto: UpsertProfileDto): Promise<ContractorProfileDto> {
    const data = {
      about: dto.about,
      categories: dto.categories,
      cities: dto.cities,
      experienceYears: dto.experienceYears,
    };
    const profile = await this.prisma.$transaction(async (tx) => {
      const before = await tx.contractorProfile.findUnique({ where: { userId } });
      const saved = await tx.contractorProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      await writeAudit(tx, {
        actorId: userId,
        action: 'PROFILE_UPDATED',
        entityType: 'contractor_profile',
        entityId: userId,
        changes: {
          profile: {
            from: before ? toProfileDto(before) : null,
            to: { ...data },
          },
        },
      });
      return saved;
    });
    return toProfileDto(profile);
  }
}
