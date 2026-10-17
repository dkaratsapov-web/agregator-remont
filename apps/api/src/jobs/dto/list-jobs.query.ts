import {
  JOB_CATEGORIES,
  JOB_LIMITS,
  JOB_SEARCH,
  JOB_STATUSES,
  JobCategory,
  JobStatus,
  PAGINATION,
} from '@agregator/shared';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
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

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Публичный каталог: пагинация + фильтры (категория, статус, город, текст). */
export class ListJobsQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(JOB_CATEGORIES)
  @ApiPropertyOptional({ enum: JOB_CATEGORIES, enumName: 'JobCategory' })
  category?: JobCategory;

  @IsOptional()
  @IsIn(JOB_STATUSES)
  @ApiPropertyOptional({ enum: JOB_STATUSES, enumName: 'JobStatus' })
  status?: JobStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(JOB_LIMITS.CITY_MIN, JOB_LIMITS.CITY_MAX)
  @ApiPropertyOptional({
    minLength: JOB_LIMITS.CITY_MIN,
    maxLength: JOB_LIMITS.CITY_MAX,
    description: 'Город, точное совпадение без учёта регистра',
  })
  city?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(JOB_SEARCH.QUERY_MIN, JOB_SEARCH.QUERY_MAX)
  @ApiPropertyOptional({
    minLength: JOB_SEARCH.QUERY_MIN,
    maxLength: JOB_SEARCH.QUERY_MAX,
    description: 'Поиск подстроки в названии и описании без учёта регистра',
  })
  q?: string;
}
