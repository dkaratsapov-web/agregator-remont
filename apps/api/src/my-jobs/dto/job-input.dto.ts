import {
  findServiceCity,
  JOB_ITEM_LIMITS,
  JOB_CATEGORIES,
  JOB_LIMITS,
  SERVICE_AREA_ERROR,
  SERVICE_CITY_NAMES,
  type JobCategory,
} from '@agregator/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ENTITY_ID_PATTERN, MULTI_LINE, SINGLE_LINE, trim, trimText } from '../../common/text';
import { jobDetailsProperty } from '../../openapi/job-details';

const budget = () => [
  ValidateIf((_: unknown, value: unknown) => value !== null),
  IsInt({ message: 'Бюджет указывается целым числом рублей' }),
  Min(0, { message: 'Бюджет не может быть отрицательным' }),
  Max(JOB_LIMITS.BUDGET_MAX, { message: 'Слишком большой бюджет' }),
];

/** Город из зоны обслуживания; регистр и ё/е не важны, сохраняется название из списка. */
const serviceCity = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (findServiceCity(value)?.name ?? value.trim()) : value;

const CITY_PROPERTY = {
  minLength: JOB_LIMITS.CITY_MIN,
  maxLength: JOB_LIMITS.CITY_MAX,
  description:
    'Город или посёлок из списка SERVICE_CITIES (@agregator/shared): Москва и Московская область, Санкт-Петербург и Ленинградская область',
};

/** Позиции других категорий: { category, details }; проверяются validateJobItems в сервисе. */
const EXTRA_ITEMS_PROPERTY = {
  type: 'array' as const,
  maxItems: JOB_ITEM_LIMITS.MAX_EXTRA,
  items: {
    type: 'object' as const,
    required: ['category', 'details'],
    properties: {
      category: { $ref: '#/components/schemas/JobCategory' },
      details: jobDetailsProperty('Ответы анкеты категории позиции'),
    },
  },
  description:
    'Позиции других категорий (до 4); категории не повторяются и не совпадают с основной. Без поля: []',
};

const apply =
  (...decorators: PropertyDecorator[]): PropertyDecorator =>
  (target, key) => {
    for (const decorator of decorators) decorator(target, key);
  };

/** Создание: все поля обязательны, бюджет можно передать null («по договорённости»). */
export class CreateJobDto {
  @Transform(trim)
  @IsString()
  @Length(JOB_LIMITS.TITLE_MIN, JOB_LIMITS.TITLE_MAX, {
    message: `Название: от ${JOB_LIMITS.TITLE_MIN} до ${JOB_LIMITS.TITLE_MAX} символов`,
  })
  @Matches(SINGLE_LINE, { message: 'Название содержит недопустимые символы' })
  @ApiProperty({ minLength: JOB_LIMITS.TITLE_MIN, maxLength: JOB_LIMITS.TITLE_MAX })
  title!: string;

  @Transform(trimText)
  @IsString()
  @Length(JOB_LIMITS.DESCRIPTION_MIN, JOB_LIMITS.DESCRIPTION_MAX, {
    message: `Описание: от ${JOB_LIMITS.DESCRIPTION_MIN} до ${JOB_LIMITS.DESCRIPTION_MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Описание содержит недопустимые символы' })
  @ApiProperty({
    minLength: JOB_LIMITS.DESCRIPTION_MIN,
    maxLength: JOB_LIMITS.DESCRIPTION_MAX,
  })
  description!: string;

  @IsIn(JOB_CATEGORIES, { message: 'Выберите категорию из списка' })
  @ApiProperty({ enum: JOB_CATEGORIES, enumName: 'JobCategory' })
  category!: JobCategory;

  @Transform(serviceCity)
  @IsString({ message: SERVICE_AREA_ERROR })
  @IsIn(SERVICE_CITY_NAMES, { message: SERVICE_AREA_ERROR })
  @ApiProperty(CITY_PROPERTY)
  city!: string;

  @apply(IsOptional(), ...budget())
  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 0,
    maximum: JOB_LIMITS.BUDGET_MAX,
    description: 'Целые рубли; null или отсутствие — «по договорённости»',
  })
  budgetMin: number | null = null;

  @apply(IsOptional(), ...budget())
  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 0,
    maximum: JOB_LIMITS.BUDGET_MAX,
    description: 'Целые рубли; null или отсутствие — «по договорённости»',
  })
  budgetMax: number | null = null;

  /** Обязательна; ответы проверяются в сервисе по анкете категории (validateJobDetails). */
  @IsDefined({ message: 'Заполните анкету заказа' })
  @IsObject({ message: 'Ответы на вопросы передаются объектом' })
  @ApiProperty(
    jobDetailsProperty(
      'Ответы анкеты категории { id вопроса: значение }. Обязательные вопросы категории должны быть отвечены',
    ),
  )
  details!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Matches(ENTITY_ID_PATTERN, { message: 'Неверный черновик' })
  @ApiPropertyOptional({
    description: 'Черновик, из которого опубликован заказ: удаляется в той же транзакции',
  })
  draftId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Неверный ключ формы' })
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Ключ формы публикации: повтор запроса с тем же ключом (двойной клик, обрыв связи) вернёт уже созданный заказ',
  })
  requestId?: string;

  @IsOptional()
  @IsArray({ message: 'Позиции заказа передаются списком' })
  @ArrayMaxSize(JOB_ITEM_LIMITS.MAX_EXTRA, {
    message: `В заказе может быть не больше ${JOB_ITEM_LIMITS.MAX_EXTRA + 1} категорий`,
  })
  @ApiPropertyOptional(EXTRA_ITEMS_PROPERTY)
  extraItems?: unknown[];
}

/** Правка: любые поля из CreateJobDto; владелец, статус и даты через API не меняются. */
export class UpdateJobDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(JOB_LIMITS.TITLE_MIN, JOB_LIMITS.TITLE_MAX, {
    message: `Название: от ${JOB_LIMITS.TITLE_MIN} до ${JOB_LIMITS.TITLE_MAX} символов`,
  })
  @Matches(SINGLE_LINE, { message: 'Название содержит недопустимые символы' })
  @ApiPropertyOptional({ minLength: JOB_LIMITS.TITLE_MIN, maxLength: JOB_LIMITS.TITLE_MAX })
  title?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @Length(JOB_LIMITS.DESCRIPTION_MIN, JOB_LIMITS.DESCRIPTION_MAX, {
    message: `Описание: от ${JOB_LIMITS.DESCRIPTION_MIN} до ${JOB_LIMITS.DESCRIPTION_MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Описание содержит недопустимые символы' })
  @ApiPropertyOptional({
    minLength: JOB_LIMITS.DESCRIPTION_MIN,
    maxLength: JOB_LIMITS.DESCRIPTION_MAX,
  })
  description?: string;

  @IsOptional()
  @IsIn(JOB_CATEGORIES, { message: 'Выберите категорию из списка' })
  @ApiPropertyOptional({ enum: JOB_CATEGORIES, enumName: 'JobCategory' })
  category?: JobCategory;

  @IsOptional()
  @Transform(serviceCity)
  @IsString({ message: SERVICE_AREA_ERROR })
  @IsIn(SERVICE_CITY_NAMES, { message: SERVICE_AREA_ERROR })
  @ApiPropertyOptional(CITY_PROPERTY)
  city?: string;

  @apply(...budget())
  @IsOptional()
  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 0,
    maximum: JOB_LIMITS.BUDGET_MAX,
    description: 'Целые рубли; null — «по договорённости»; отсутствие — не менять',
  })
  budgetMin?: number | null;

  @apply(...budget())
  @IsOptional()
  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 0,
    maximum: JOB_LIMITS.BUDGET_MAX,
    description: 'Целые рубли; null — «по договорённости»; отсутствие — не менять',
  })
  budgetMax?: number | null;

  @IsOptional()
  @IsObject({ message: 'Ответы на вопросы передаются объектом' })
  @ApiPropertyOptional(
    jobDetailsProperty(
      'Ответы анкеты целиком (заменяют прежние); без поля: не менять. При смене категории обязательно',
    ),
  )
  details?: Record<string, unknown>;

  @IsOptional()
  @IsArray({ message: 'Позиции заказа передаются списком' })
  @ArrayMaxSize(JOB_ITEM_LIMITS.MAX_EXTRA, {
    message: `В заказе может быть не больше ${JOB_ITEM_LIMITS.MAX_EXTRA + 1} категорий`,
  })
  @ApiPropertyOptional({
    ...EXTRA_ITEMS_PROPERTY,
    description: 'Позиции других категорий целиком (заменяют прежние); без поля: не менять',
  })
  extraItems?: unknown[];

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Неверная версия заказа' })
  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'updatedAt заказа, с которым открыта форма. Если заказ с тех пор изменён (другая вкладка) — 409, правка не применяется',
  })
  expectedUpdatedAt?: string;
}
