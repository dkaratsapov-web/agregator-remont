import type { ContractorProfileDto } from '@agregator/shared';
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { UpsertProfileDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

@Controller('v1/me/profile')
@UseGuards(SessionGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  get(@CurrentAuth() auth: AuthContext): Promise<ContractorProfileDto> {
    return this.profiles.get(auth.user.id);
  }

  @Put()
  @WriteRateLimited()
  upsert(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpsertProfileDto,
  ): Promise<ContractorProfileDto> {
    return this.profiles.upsert(auth.user.id, dto);
  }
}
