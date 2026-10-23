import type {
  AdminUserDto,
  BlockedStateDto,
  ContentFlagDto,
  HiddenStateDto,
  MyReportDto,
  Paginated,
  PasswordResetLinkDto,
  ReportDto,
  ReportReceivedDto,
} from '@agregator/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiRole, ApiSession } from '../openapi/decorators';
import {
  BlockedStateSchema,
  ContentFlagSchema,
  HiddenStateSchema,
  PaginatedAdminUserSchema,
  PaginatedContentFlagSchema,
  PaginatedMyReportSchema,
  PaginatedReportSchema,
  PasswordResetLinkSchema,
  ReportReceivedSchema,
  ReportSchema,
} from '../openapi/schemas';
import { PaginationQuery } from '../jobs/dto/list-jobs.query';
import { AdminUsersService } from './admin-users.service';
import {
  BlockDto,
  CreateReportDto,
  HideDto,
  ListFlagsQuery,
  ListReportsQuery,
  ListUsersQuery,
  ResolveFlagDto,
  ResolveReportDto,
} from './dto/moderation.dto';
import { ModerationService } from './moderation.service';
import { ReportsService } from './reports.service';

/** Жалоба пользователя на заказ, сообщение или отклик. */
@ApiTags('reports')
@ApiSession()
@ApiErrors(429)
@Controller('v1/reports')
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @WriteRateLimited()
  @ApiCreatedResponse({
    type: ReportReceivedSchema,
    description: 'Жалоба принята (duplicate — такая уже ждёт разбора)',
  })
  @ApiErrors(400, 404)
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateReportDto,
  ): Promise<ReportReceivedDto> {
    return this.reports.create(auth.user, dto);
  }

  @Get('mine')
  @ApiOkResponse({ type: PaginatedMyReportSchema, description: 'Свои жалобы и решения по ним' })
  @ApiErrors(400)
  mine(
    @CurrentAuth() auth: AuthContext,
    @Query() query: PaginationQuery,
  ): Promise<Paginated<MyReportDto>> {
    return this.reports.mine(auth.user, query.page);
  }

  // Без лимита записи, как отметка уведомлений: вызывается сам при открытии «Моих жалоб»,
  // повтор ничего не меняет (только свои строки, одно обновление); общий лимит запросов действует.
  @Post('mine/seen')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Решения по своим жалобам отмечены просмотренными' })
  async markSeen(@CurrentAuth() auth: AuthContext): Promise<void> {
    await this.reports.markSeen(auth.user);
  }
}

/** Модерация для администратора. Порядок guard'ов: сначала сессия, затем роль. */
@ApiTags('admin')
@ApiErrors(429)
@ApiRole()
@Controller('v1/admin')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class AdminModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly users: AdminUsersService,
  ) {}

  @Get('users')
  @ApiOkResponse({ type: PaginatedAdminUserSchema })
  @ApiErrors(400)
  listUsers(@Query() query: ListUsersQuery): Promise<Paginated<AdminUserDto>> {
    return this.users.list(query);
  }

  @Post('users/:id/password-reset')
  @WriteRateLimited()
  @ApiCreatedResponse({ type: PasswordResetLinkSchema, description: 'Ссылка для нового пароля' })
  @ApiErrors(404, 409)
  issuePasswordReset(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<PasswordResetLinkDto> {
    return this.users.issuePasswordReset(auth.user.id, id);
  }

  @Get('flags')
  @ApiOkResponse({ type: PaginatedContentFlagSchema })
  @ApiErrors(400)
  listFlags(@Query() query: ListFlagsQuery): Promise<Paginated<ContentFlagDto>> {
    return this.moderation.listFlags(query);
  }

  @Post('flags/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: ContentFlagSchema })
  @ApiErrors(400, 404, 409)
  resolveFlag(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ResolveFlagDto,
  ): Promise<ContentFlagDto> {
    return this.moderation.resolveFlag(auth.user.id, id, dto);
  }

  @Get('reports')
  @ApiOkResponse({ type: PaginatedReportSchema })
  @ApiErrors(400)
  list(@Query() query: ListReportsQuery): Promise<Paginated<ReportDto>> {
    return this.moderation.list(query);
  }

  @Post('reports/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: ReportSchema })
  @ApiErrors(400, 404, 409)
  resolve(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
  ): Promise<ReportDto> {
    return this.moderation.resolve(auth.user.id, id, dto);
  }

  @Post('jobs/:id/hidden')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: HiddenStateSchema })
  @ApiErrors(400, 404)
  hideJob(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: HideDto,
  ): Promise<HiddenStateDto> {
    return this.moderation.setJobHidden(auth.user.id, id, dto);
  }

  @Post('messages/:id/hidden')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: HiddenStateSchema })
  @ApiErrors(400, 404)
  hideMessage(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: HideDto,
  ): Promise<HiddenStateDto> {
    return this.moderation.setMessageHidden(auth.user.id, id, dto);
  }

  @Post('bids/:id/hidden')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: HiddenStateSchema })
  @ApiErrors(400, 404, 409)
  hideBid(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: HideDto,
  ): Promise<HiddenStateDto> {
    return this.moderation.setBidHidden(auth.user.id, id, dto);
  }

  @Post('reviews/:id/hidden')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: HiddenStateSchema })
  @ApiErrors(400, 404)
  hideReview(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: HideDto,
  ): Promise<HiddenStateDto> {
    return this.moderation.setReviewHidden(auth.user.id, id, dto);
  }

  @Post('users/:id/blocked')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: BlockedStateSchema })
  @ApiErrors(400, 404, 409)
  block(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: BlockDto,
  ): Promise<BlockedStateDto> {
    return this.moderation.setUserBlocked(auth.user.id, id, dto);
  }
}
