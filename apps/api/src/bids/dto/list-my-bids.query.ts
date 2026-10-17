import { IsOptional, Matches } from 'class-validator';
import { PaginationQuery } from '../../jobs/dto/list-jobs.query';
import { ENTITY_ID_PATTERN } from '../../common/text';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListMyBidsQuery extends PaginationQuery {
  /** Только отклик на конкретный заказ (для страницы заказа). */
  @IsOptional()
  @Matches(ENTITY_ID_PATTERN)
  @ApiPropertyOptional({ pattern: ENTITY_ID_PATTERN.source })
  jobId?: string;
}
