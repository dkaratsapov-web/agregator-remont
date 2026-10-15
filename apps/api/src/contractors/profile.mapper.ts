import type { ContractorProfileDto } from '@agregator/shared';
import type { ContractorProfile } from '@prisma/client';

export const EMPTY_PROFILE: ContractorProfileDto = {
  about: '',
  categories: [],
  cities: [],
  experienceYears: null,
  updatedAt: null,
};

export function toProfileDto(profile: ContractorProfile | null): ContractorProfileDto {
  if (!profile) return EMPTY_PROFILE;
  return {
    about: profile.about,
    categories: profile.categories,
    cities: profile.cities,
    experienceYears: profile.experienceYears,
    updatedAt: profile.updatedAt.toISOString(),
  };
}
