import { JOB_LIMITS, type PriceEstimatesDto } from '@agregator/shared';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiSession } from '../openapi/decorators';
import { PriceEstimatesSchema } from '../openapi/schemas';
import { PriceEstimatesService } from './price-estimates.service';

export class PriceEstimatesQuery {
  @IsOptional()
  @IsString()
  @MaxLength(JOB_LIMITS.CITY_MAX)
  @ApiPropertyOptional({
    description: 'Город заказа; неизвестный город — оценка по всем городам',
    maxLength: JOB_LIMITS.CITY_MAX,
  })
  city?: string;
}

/** Сколько обычно просят мастера: для подсказки к бюджету в форме заказа. */
@ApiTags('jobs')
@ApiErrors(429)
@ApiSession()
@Controller('v1/price-estimates')
@UseGuards(SessionGuard)
export class PriceEstimatesController {
  constructor(private readonly estimates: PriceEstimatesService) {}

  @Get()
  @ApiOkResponse({ type: PriceEstimatesSchema })
  @ApiErrors(400)
  list(@Query() query: PriceEstimatesQuery): Promise<PriceEstimatesDto> {
    return this.estimates.estimates(query.city);
  }
}
