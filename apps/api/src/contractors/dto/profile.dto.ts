import { JOB_CATEGORIES, PROFILE_LIMITS, type JobCategory } from '@agregator/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MULTI_LINE_OR_EMPTY, SINGLE_LINE, trimText } from '../../common/text';

/** Города: trim каждого значения, регистронезависимые дубликаты убираются. */
const normalizeCities = ({ value }: { value: unknown }) => {
  if (!Array.isArray(value)) return value;
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      result.push(item);
      continue;
    }
    const city = item.trim();
    if (!seen.has(city.toLowerCase())) {
      seen.add(city.toLowerCase());
      result.push(city);
    }
  }
  return result;
};

/** Полная замена профиля (PUT): все поля передаются целиком. */
export class UpsertProfileDto {
  @Transform(trimText)
  @IsString()
  @MaxLength(PROFILE_LIMITS.ABOUT_MAX, {
    message: `О себе: не больше ${PROFILE_LIMITS.ABOUT_MAX} символов`,
  })
  @Matches(MULTI_LINE_OR_EMPTY, { message: 'Текст «о себе» содержит недопустимые символы' })
  about!: string;

  @IsArray()
  @ArrayMaxSize(PROFILE_LIMITS.CATEGORIES_MAX)
  @ArrayUnique()
  @IsIn(JOB_CATEGORIES, { each: true, message: 'Неизвестная категория работ' })
  categories!: JobCategory[];

  @Transform(normalizeCities)
  @IsArray()
  @ArrayMaxSize(PROFILE_LIMITS.CITIES_MAX, {
    message: `Не больше ${PROFILE_LIMITS.CITIES_MAX} городов`,
  })
  @IsString({ each: true })
  @Length(PROFILE_LIMITS.CITY_MIN, PROFILE_LIMITS.CITY_MAX, {
    each: true,
    message: `Город: от ${PROFILE_LIMITS.CITY_MIN} до ${PROFILE_LIMITS.CITY_MAX} символов`,
  })
  @Matches(SINGLE_LINE, { each: true, message: 'Город содержит недопустимые символы' })
  cities!: string[];

  @IsOptional()
  @ValidateIf((_: unknown, value: unknown) => value !== null)
  @IsInt({ message: 'Опыт указывается целым числом лет' })
  @Min(0)
  @Max(PROFILE_LIMITS.EXPERIENCE_MAX_YEARS)
  experienceYears: number | null = null;
}
