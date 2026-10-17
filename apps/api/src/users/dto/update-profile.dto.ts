import { ACCOUNT_LIMITS, AUTH_LIMITS, LEAD_LIMITS } from '@agregator/shared';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SINGLE_LINE, trim } from '../../common/text';

/** Пустая строка — то же, что null (поле очищено). */
const emptyToNull = ({ value }: { value: unknown }) => {
  const trimmed = typeof value === 'string' ? value.trim() : value;
  return trimmed === '' ? null : trimmed;
};

/** Частичное изменение профиля: переданные поля меняются, остальные остаются как есть. */
export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(AUTH_LIMITS.NAME_MIN, AUTH_LIMITS.NAME_MAX, {
    message: `Имя должно содержать от ${AUTH_LIMITS.NAME_MIN} до ${AUTH_LIMITS.NAME_MAX} символов`,
  })
  @Matches(SINGLE_LINE, { message: 'Имя содержит недопустимые символы' })
  @ApiPropertyOptional({ minLength: AUTH_LIMITS.NAME_MIN, maxLength: AUTH_LIMITS.NAME_MAX })
  name?: string;

  /** Нормализуется сервисом в +7XXXXXXXXXX; null или пустая строка удаляют телефон. */
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(LEAD_LIMITS.PHONE_RAW_MAX)
  @ApiPropertyOptional({ type: String, nullable: true, example: '+7 900 123-45-67' })
  phone?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(ACCOUNT_LIMITS.CITY_MAX)
  @Matches(SINGLE_LINE, { message: 'Город содержит недопустимые символы' })
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: ACCOUNT_LIMITS.CITY_MAX })
  city?: string | null;
}
