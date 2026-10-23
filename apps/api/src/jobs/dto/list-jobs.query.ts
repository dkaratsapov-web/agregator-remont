import {
  JOB_CATEGORIES,
  JOB_LIMITS,
  JOB_POSTED_DAYS,
  JOB_SEARCH,
  JOB_SORTS,
  JOB_STATUSES,
  JobCategory,
  JobPostedDays,
  JobSort,
  JobStatus,
  PAGINATION,
} from '@agregator/shared';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(JOB_LIMITS.BUDGET_MAX)
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: JOB_LIMITS.BUDGET_MAX,
    description:
      'Бюджет от, ₽: верхняя граница бюджета заказа не меньше. Заказы без бюджета не входят',
  })
  budgetFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(JOB_LIMITS.BUDGET_MAX)
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: JOB_LIMITS.BUDGET_MAX,
    description:
      'Бюджет до, ₽: нижняя граница бюджета заказа не больше. Заказы без бюджета не входят',
  })
  budgetTo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn(JOB_POSTED_DAYS)
  @ApiPropertyOptional({ enum: JOB_POSTED_DAYS, description: 'Опубликован за последние N дней' })
  days?: JobPostedDays;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === '1' ? true : value === 'false' || value === '0' ? false : value,
  )
  @IsBoolean()
  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Только заказы без откликов (отозванные, скрытые и отклики заблокированных мастеров не считаются)',
  })
  noBids?: boolean;

  @IsOptional()
  @IsIn(JOB_SORTS)
  @ApiPropertyOptional({
    enum: JOB_SORTS,
    enumName: 'JobSort',
    default: 'new',
    description:
      'new — сначала новые; budget_desc — по нижней границе бюджета, budget_asc — по верхней; без бюджета в конце',
  })
  sort: JobSort = 'new';
}
