import { REVIEW_LIMITS } from '@agregator/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MULTI_LINE_OR_EMPTY, trimText } from '../../common/text';

export class CreateReviewDto {
  @IsInt({ message: 'Поставьте оценку от 1 до 5' })
  @Min(REVIEW_LIMITS.RATING_MIN, { message: 'Поставьте оценку от 1 до 5' })
  @Max(REVIEW_LIMITS.RATING_MAX, { message: 'Поставьте оценку от 1 до 5' })
  @ApiProperty({ type: 'integer', minimum: REVIEW_LIMITS.RATING_MIN, maximum: REVIEW_LIMITS.RATING_MAX })
  rating!: number;

  @Transform(trimText)
  @IsString()
  @MaxLength(REVIEW_LIMITS.TEXT_MAX, {
    message: `Отзыв: не больше ${REVIEW_LIMITS.TEXT_MAX} символов`,
  })
  @Matches(MULTI_LINE_OR_EMPTY, { message: 'Отзыв содержит недопустимые символы' })
  @ApiPropertyOptional({ maxLength: REVIEW_LIMITS.TEXT_MAX, default: '' })
  text: string = '';
}

export class ContractorReviewsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 1000, default: 1 })
  page: number = 1;
}
