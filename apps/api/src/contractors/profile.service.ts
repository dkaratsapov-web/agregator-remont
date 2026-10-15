import type { ContractorProfileDto } from '@agregator/shared';
import { Injectable } from '@nestjs/common';
import type { ContractorProfile } from '@prisma/client';
import { writeAudit } from '../audit/audit';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertProfileDto } from './dto/profile.dto';
import { toProfileDto } from './profile.mapper';

/** Содержимое профиля для журнала (без служебных дат). */
function snapshot(profile: ContractorProfile | null) {
  if (!profile) return null;
  return {
    about: profile.about,
    categories: profile.categories,
    cities: profile.cities,
    experienceYears: profile.experienceYears,
  };
}

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
      // Блокировка строки пользователя до чтения профиля: изменения профиля одного подрядчика,
      // включая самое первое создание, выполняются по очереди, и «было» в журнале — это
      // действительно предыдущее состояние.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
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
        changes: { profile: { from: snapshot(before), to: snapshot(saved) } },
      });
      return saved;
    });
    return toProfileDto(profile);
  }
}
