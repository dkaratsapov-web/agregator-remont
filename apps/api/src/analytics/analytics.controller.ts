import { ANALYTICS_PERIODS, type AnalyticsDto, type AnalyticsPeriod } from '@agregator/shared';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiRole } from '../openapi/decorators';
import { AnalyticsSchema } from '../openapi/schemas';
import { AnalyticsService } from './analytics.service';

export class AnalyticsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsIn(ANALYTICS_PERIODS, { message: `Период: ${ANALYTICS_PERIODS.join(', ')} дней` })
  @ApiPropertyOptional({ enum: ANALYTICS_PERIODS, default: 30, description: 'Период, дней' })
  days: AnalyticsPeriod = 30;
}

/** Воронка для владельца: только числа по дням, без персональных данных (docs/ANALYTICS.md). */
@ApiTags('admin')
@ApiErrors(429)
@ApiRole()
@Controller('v1/admin/analytics')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @ApiOkResponse({ type: AnalyticsSchema })
  @ApiErrors(400)
  report(@Query() query: AnalyticsQuery): Promise<AnalyticsDto> {
    return this.analytics.report(query.days);
  }
}
