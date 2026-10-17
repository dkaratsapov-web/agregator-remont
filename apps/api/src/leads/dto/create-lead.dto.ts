import { LEAD_LIMITS } from '@agregator/shared';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SINGLE_LINE, trim } from '../../common/text';

/** Заявка с главной. Формат телефона проверяется в сервисе (normalizeRuPhone). */
export class CreateLeadDto {
  @Transform(trim)
  @IsString()
  @Length(LEAD_LIMITS.NAME_MIN, LEAD_LIMITS.NAME_MAX, {
    message: `Имя: от ${LEAD_LIMITS.NAME_MIN} до ${LEAD_LIMITS.NAME_MAX} символов`,
  })
  @Matches(SINGLE_LINE, { message: 'Имя содержит недопустимые символы' })
  @ApiProperty({ minLength: LEAD_LIMITS.NAME_MIN, maxLength: LEAD_LIMITS.NAME_MAX })
  name!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(LEAD_LIMITS.PHONE_RAW_MAX, { message: 'Проверьте номер телефона' })
  @ApiProperty({ maxLength: LEAD_LIMITS.PHONE_RAW_MAX, example: '+7 900 123-45-67' })
  phone!: string;

  @IsBoolean()
  @Equals(true, { message: 'Нужно согласие на обработку персональных данных' })
  @ApiProperty({ description: 'Согласие на обработку персональных данных', enum: [true] })
  consent!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiPropertyOptional({
    description: 'Ловушка для ботов: людям не показывается, должна быть пустой',
  })
  website?: string;
}
