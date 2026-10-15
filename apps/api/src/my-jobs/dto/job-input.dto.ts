import { JOB_CATEGORIES, JOB_LIMITS, type JobCategory } from '@agregator/shared';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** trim + единый перевод строки: браузеры отправляют textarea с \r\n. */
const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : value;
/** Без управляющих и невидимых символов (bidi-override, нулевые байты, переводы строк). */
const SINGLE_LINE = /^[^\p{C}]+$/u;
/** Как SINGLE_LINE, но переводы строк и табы в описании разрешены. */
const MULTI_LINE = /^(?:[^\p{C}]|[\n\r\t])+$/u;

const budget = () => [
  ValidateIf((_: unknown, value: unknown) => value !== null),
  IsInt({ message: 'Бюджет указывается целым числом рублей' }),
  Min(0, { message: 'Бюджет не может быть отрицательным' }),
  Max(JOB_LIMITS.BUDGET_MAX, { message: 'Слишком большой бюджет' }),
];

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
  title!: string;

  @Transform(trimText)
  @IsString()
  @Length(JOB_LIMITS.DESCRIPTION_MIN, JOB_LIMITS.DESCRIPTION_MAX, {
    message: `Описание: от ${JOB_LIMITS.DESCRIPTION_MIN} до ${JOB_LIMITS.DESCRIPTION_MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Описание содержит недопустимые символы' })
  description!: string;

  @IsIn(JOB_CATEGORIES, { message: 'Выберите категорию из списка' })
  category!: JobCategory;

  @Transform(trim)
  @IsString()
  @Length(JOB_LIMITS.CITY_MIN, JOB_LIMITS.CITY_MAX, {
    message: `Город: от ${JOB_LIMITS.CITY_MIN} до ${JOB_LIMITS.CITY_MAX} символов`,
  })
  @Matches(SINGLE_LINE, { message: 'Город содержит недопустимые символы' })
  city!: string;

  @apply(IsOptional(), ...budget())
  budgetMin: number | null = null;

  @apply(IsOptional(), ...budget())
  budgetMax: number | null = null;
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
  title?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @Length(JOB_LIMITS.DESCRIPTION_MIN, JOB_LIMITS.DESCRIPTION_MAX, {
    message: `Описание: от ${JOB_LIMITS.DESCRIPTION_MIN} до ${JOB_LIMITS.DESCRIPTION_MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Описание содержит недопустимые символы' })
  description?: string;

  @IsOptional()
  @IsIn(JOB_CATEGORIES, { message: 'Выберите категорию из списка' })
  category?: JobCategory;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(JOB_LIMITS.CITY_MIN, JOB_LIMITS.CITY_MAX, {
    message: `Город: от ${JOB_LIMITS.CITY_MIN} до ${JOB_LIMITS.CITY_MAX} символов`,
  })
  @Matches(SINGLE_LINE, { message: 'Город содержит недопустимые символы' })
  city?: string;

  @apply(...budget())
  @IsOptional()
  budgetMin?: number | null;

  @apply(...budget())
  @IsOptional()
  budgetMax?: number | null;
}
