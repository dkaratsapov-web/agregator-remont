import type { LeadDto, Paginated } from '@agregator/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiRole } from '../openapi/decorators';
import { LeadReceivedSchema, LeadSchema, PaginatedLeadSchema } from '../openapi/schemas';
import { ListLeadsQuery, UpdateLeadDto } from './dto/admin-leads.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadsService } from './leads.service';

/** Публичный приём заявок с главной (без сессии): лимит write + суточный лимит в сервисе. */
@ApiTags('leads')
@ApiErrors(429)
@Controller('v1/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @WriteRateLimited()
  @ApiCreatedResponse({ type: LeadReceivedSchema })
  @ApiErrors(400, 503)
  async create(@Body() dto: CreateLeadDto): Promise<{ received: true }> {
    await this.leads.create(dto);
    return { received: true };
  }
}

/** Заявки для администратора. Порядок guard'ов: сначала сессия, затем роль. */
@ApiTags('admin')
@ApiErrors(429)
@ApiRole()
@Controller('v1/admin/leads')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class AdminLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedLeadSchema })
  @ApiErrors(400)
  list(@Query() query: ListLeadsQuery): Promise<Paginated<LeadDto>> {
    return this.leads.list(query);
  }

  @Patch(':id')
  @WriteRateLimited()
  @ApiOkResponse({ type: LeadSchema })
  @ApiErrors(400, 404)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ): Promise<LeadDto> {
    return this.leads.setProcessed(auth.user.id, id, dto.processed);
  }
}
