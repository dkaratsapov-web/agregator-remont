import { JOB_CATEGORIES, JobCategory, PAGINATION } from '@agregator/shared';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Пагинация списков. Отдельно от фильтров, чтобы маршрут не принимал параметры, которые он не использует. */
export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_PAGE)
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PAGINATION.MAX_PAGE,
    default: PAGINATION.DEFAULT_PAGE,
  })
  page: number = PAGINATION.DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_LIMIT)
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PAGINATION.MAX_LIMIT,
    default: PAGINATION.DEFAULT_LIMIT,
  })
  limit: number = PAGINATION.DEFAULT_LIMIT;
}

/** Публичный каталог: пагинация + фильтр по категории. */
export class ListJobsQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(JOB_CATEGORIES)
  @ApiPropertyOptional({ enum: JOB_CATEGORIES, enumName: 'JobCategory' })
  category?: JobCategory;
}
