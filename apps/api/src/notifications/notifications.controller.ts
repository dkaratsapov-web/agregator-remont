import type { NotificationsPageDto, NotificationsSummaryDto } from '@agregator/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiSession } from '../openapi/decorators';
import { NotificationsPageSchema, NotificationsSummarySchema } from '../openapi/schemas';
import { ListNotificationsQuery, MarkNotificationsReadDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/** Уведомления в кабинете: только свои. */
@ApiTags('notifications')
@ApiSession()
@ApiErrors(429)
@Controller('v1/me/notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({ type: NotificationsPageSchema })
  @ApiErrors(400)
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ListNotificationsQuery,
  ): Promise<NotificationsPageDto> {
    return this.notifications.list(auth.user.id, query);
  }

  @Get('summary')
  @ApiOkResponse({ type: NotificationsSummarySchema })
  summary(@CurrentAuth() auth: AuthContext): Promise<NotificationsSummaryDto> {
    return this.notifications.summary(auth.user.id);
  }

  // Без лимита записи: вызывается сам при открытии заказа; общий лимит запросов действует.
  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: NotificationsSummarySchema })
  @ApiErrors(400)
  markRead(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: MarkNotificationsReadDto,
  ): Promise<NotificationsSummaryDto> {
    return this.notifications.markRead(auth.user.id, dto);
  }
}
