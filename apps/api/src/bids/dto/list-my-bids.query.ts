import { IsOptional, Matches } from 'class-validator';
import { ListJobsQuery } from '../../jobs/dto/list-jobs.query';
import { ENTITY_ID_PATTERN } from '../../common/text';

export class ListMyBidsQuery extends ListJobsQuery {
  /** Только отклик на конкретный заказ (для страницы заказа). */
  @IsOptional()
  @Matches(ENTITY_ID_PATTERN)
  jobId?: string;
}
