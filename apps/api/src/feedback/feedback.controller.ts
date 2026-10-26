import type { AdminFeedbackDto, FeedbackDto, Paginated } from '@agregator/shared';
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
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiRole, ApiSession } from '../openapi/decorators';
import {
  AdminFeedbackSchema,
  FeedbackSchema,
  PaginatedAdminFeedbackSchema,
} from '../openapi/schemas';
import { CreateFeedbackDto, ListFeedbackQuery, ReplyFeedbackDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

/** Обращения участника тестирования: отправить и посмотреть свои. Любая роль. */
@ApiTags('feedback')
@ApiErrors(429)
@ApiSession()
@Controller('v1/me/feedback')
@UseGuards(SessionGuard)
export class MyFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @WriteRateLimited()
  @ApiCreatedResponse({ type: FeedbackSchema })
  @ApiErrors(400)
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateFeedbackDto): Promise<FeedbackDto> {
    return this.feedback.create(auth.user, dto);
  }

  @Get()
  @ApiOkResponse({ type: [FeedbackSchema] })
  mine(@CurrentAuth() auth: AuthContext): Promise<FeedbackDto[]> {
    return this.feedback.mine(auth.user);
  }
}

/** Очередь обращений для администратора. Порядок guard'ов: сначала сессия, затем роль. */
@ApiTags('admin')
@ApiErrors(429)
@ApiRole()
@Controller('v1/admin/feedback')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class AdminFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedAdminFeedbackSchema })
  @ApiErrors(400)
  list(@Query() query: ListFeedbackQuery): Promise<Paginated<AdminFeedbackDto>> {
    return this.feedback.list(query);
  }

  @Post(':id/reply')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: AdminFeedbackSchema })
  @ApiErrors(400, 404, 409)
  reply(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ReplyFeedbackDto,
  ): Promise<AdminFeedbackDto> {
    return this.feedback.reply(auth.user.id, id, dto.reply);
  }
}
