import type { OwnJobDto, Paginated } from '@agregator/shared';
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
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { PaginationQuery } from '../jobs/dto/list-jobs.query';
import { CreateJobDto, UpdateJobDto } from './dto/job-input.dto';
import { MyJobsService } from './my-jobs.service';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrors, ApiRole } from '../openapi/decorators';
import { OwnJobSchema, PaginatedOwnJobSchema } from '../openapi/schemas';

/** Заказы текущего заказчика. Порядок guard'ов важен: сначала сессия, затем роль. */
@ApiTags('my-jobs')
@ApiErrors(429)
@ApiRole()
@Controller('v1/me/jobs')
@UseGuards(SessionGuard, RolesGuard)
@Roles('CUSTOMER')
export class MyJobsController {
  constructor(private readonly jobs: MyJobsService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedOwnJobSchema })
  @ApiErrors(400)
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: PaginationQuery,
  ): Promise<Paginated<OwnJobDto>> {
    return this.jobs.list(auth.user.id, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: OwnJobSchema })
  @ApiErrors(404)
  get(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<OwnJobDto> {
    return this.jobs.get(auth.user.id, id);
  }

  @Post()
  @WriteRateLimited()
  @ApiCreatedResponse({ type: OwnJobSchema })
  @ApiErrors(400)
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateJobDto): Promise<OwnJobDto> {
    return this.jobs.create(auth.user.id, dto);
  }

  @Patch(':id')
  @WriteRateLimited()
  @ApiOkResponse({ type: OwnJobSchema })
  @ApiErrors(400, 404, 409)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
  ): Promise<OwnJobDto> {
    return this.jobs.update(auth.user.id, id, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: OwnJobSchema })
  @ApiErrors(404, 409)
  close(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<OwnJobDto> {
    return this.jobs.close(auth.user.id, id);
  }
}
