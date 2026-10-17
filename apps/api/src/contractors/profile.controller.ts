import type { ContractorProfileDto } from '@agregator/shared';
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { UpsertProfileDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrors, ApiRole } from '../openapi/decorators';
import { ContractorProfileSchema } from '../openapi/schemas';

@ApiTags('profile')
@ApiErrors(429)
@ApiRole()
@Controller('v1/me/profile')
@UseGuards(SessionGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @ApiOkResponse({ type: ContractorProfileSchema })
  get(@CurrentAuth() auth: AuthContext): Promise<ContractorProfileDto> {
    return this.profiles.get(auth.user.id);
  }

  @Put()
  @WriteRateLimited()
  @ApiOkResponse({ type: ContractorProfileSchema })
  @ApiErrors(400)
  upsert(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpsertProfileDto,
  ): Promise<ContractorProfileDto> {
    return this.profiles.upsert(auth.user.id, dto);
  }
}
