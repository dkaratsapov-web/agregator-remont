import { BID_LIMITS, JOB_LIMITS } from '@agregator/shared';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { MULTI_LINE, trimText } from '../../common/text';

export class CreateBidDto {
  @IsInt({ message: 'Цена указывается целым числом рублей' })
  @Min(0, { message: 'Цена не может быть отрицательной' })
  @Max(JOB_LIMITS.BUDGET_MAX, { message: 'Слишком большая цена' })
  price!: number;

  @IsOptional()
  @ValidateIf((_: unknown, value: unknown) => value !== null)
  @IsInt({ message: 'Срок указывается целым числом дней' })
  @Min(1, { message: 'Срок: не меньше 1 дня' })
  @Max(BID_LIMITS.DURATION_MAX_DAYS, {
    message: `Срок: не больше ${BID_LIMITS.DURATION_MAX_DAYS} дней`,
  })
  durationDays: number | null = null;

  @Transform(trimText)
  @IsString()
  @Length(BID_LIMITS.COMMENT_MIN, BID_LIMITS.COMMENT_MAX, {
    message: `Комментарий: от ${BID_LIMITS.COMMENT_MIN} до ${BID_LIMITS.COMMENT_MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Комментарий содержит недопустимые символы' })
  comment!: string;
}
