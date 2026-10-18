import { JOB_CATEGORIES, JOB_ITEM_LIMITS, JOB_LIMITS, type JobCategory } from '@agregator/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MULTI_LINE, SINGLE_LINE } from '../../common/text';
import { jobDetailsProperty } from '../../openapi/job-details';

/** Пустая строка после обрезки пробелов — «не заполнено» (null). */
const blankToNull =
  (normalize: (value: string) => string) =>
  ({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const text = normalize(value);
    return text === '' ? null : text;
  };
const line = blankToNull((value) => value.trim());
const text = blankToNull((value) => value.replace(/\r\n?/g, '\n').trim());

const notNull = ValidateIf((_: unknown, value: unknown) => value !== null && value !== undefined);

const budget = (): PropertyDecorator => (target, key) => {
  for (const decorator of [
    notNull,
    IsInt({ message: 'Бюджет указывается целым числом рублей' }),
    Min(0, { message: 'Бюджет не может быть отрицательным' }),
    Max(JOB_LIMITS.BUDGET_MAX, { message: 'Слишком большой бюджет' }),
  ]) {
    decorator(target, key);
  }
};

/**
 * Черновик: каждое поле необязательно и может быть null. Проверяются только типы и пределы
 * длины, чтобы черновик можно было сохранить на любом шаге. Минимальные длины, город из зоны
 * обслуживания и обязательные вопросы анкеты проверяются при публикации.
 */
export class SaveDraftDto {
  @Transform(line)
  @notNull
  @IsString()
  @MaxLength(JOB_LIMITS.TITLE_MAX, {
    message: `Название: не больше ${JOB_LIMITS.TITLE_MAX} символов`,
  })
  @Matches(SINGLE_LINE, { message: 'Название содержит недопустимые символы' })
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: JOB_LIMITS.TITLE_MAX })
  title?: string | null;

  @Transform(text)
  @notNull
  @IsString()
  @MaxLength(JOB_LIMITS.DESCRIPTION_MAX, {
    message: `Описание: не больше ${JOB_LIMITS.DESCRIPTION_MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Описание содержит недопустимые символы' })
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: JOB_LIMITS.DESCRIPTION_MAX })
  description?: string | null;

  @notNull
  @IsIn(JOB_CATEGORIES, { message: 'Выберите категорию из списка' })
  @ApiPropertyOptional({ enum: JOB_CATEGORIES, enumName: 'JobCategory', nullable: true })
  category?: JobCategory | null;

  @Transform(line)
  @notNull
  @IsString()
  @MaxLength(JOB_LIMITS.CITY_MAX, { message: `Город: не больше ${JOB_LIMITS.CITY_MAX} символов` })
  @Matches(SINGLE_LINE, { message: 'Город содержит недопустимые символы' })
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: JOB_LIMITS.CITY_MAX })
  city?: string | null;

  @budget()
  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 0,
    maximum: JOB_LIMITS.BUDGET_MAX,
  })
  budgetMin?: number | null;

  @budget()
  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 0,
    maximum: JOB_LIMITS.BUDGET_MAX,
  })
  budgetMax?: number | null;

  @IsOptional()
  @IsObject({ message: 'Ответы на вопросы передаются объектом' })
  @ApiPropertyOptional(
    jobDetailsProperty(
      'Ответы анкеты; проверяются мягко: неверные и не подходящие категории отбрасываются',
    ),
  )
  details?: Record<string, unknown>;

  @IsOptional()
  @IsArray({ message: 'Позиции заказа передаются списком' })
  @ArrayMaxSize(JOB_ITEM_LIMITS.MAX_EXTRA, {
    message: `В заказе может быть не больше ${JOB_ITEM_LIMITS.MAX_EXTRA + 1} категорий`,
  })
  @ApiPropertyOptional({
    type: 'array',
    maxItems: JOB_ITEM_LIMITS.MAX_EXTRA,
    items: { type: 'object' },
    description: 'Позиции других категорий; проверяются мягко, неверные отбрасываются',
  })
  extraItems?: unknown[];
}
