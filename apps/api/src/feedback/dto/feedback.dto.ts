import { FEEDBACK_KINDS, FEEDBACK_LIMITS, type FeedbackKind } from '@agregator/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../jobs/dto/list-jobs.query';
import { MULTI_LINE, trim, trimText } from '../../common/text';

export class CreateFeedbackDto {
  @IsIn(FEEDBACK_KINDS, { message: 'Выберите: ошибка, идея или вопрос' })
  @ApiProperty({ enum: FEEDBACK_KINDS, enumName: 'FeedbackKind' })
  kind!: FeedbackKind;

  @Transform(trimText)
  @IsString()
  @Length(FEEDBACK_LIMITS.BODY_MIN, FEEDBACK_LIMITS.BODY_MAX, {
    message: `Опишите подробнее: от ${FEEDBACK_LIMITS.BODY_MIN} до ${FEEDBACK_LIMITS.BODY_MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Текст содержит недопустимые символы' })
  @ApiProperty({ minLength: FEEDBACK_LIMITS.BODY_MIN, maxLength: FEEDBACK_LIMITS.BODY_MAX })
  body!: string;

  /** Только путь сайта: без домена, пробелов и управляющих символов. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(FEEDBACK_LIMITS.PAGE_MAX)
  @Matches(/^\/[^\s\p{C}]*$/u, { message: 'Страница: путь сайта, например /account' })
  @ApiPropertyOptional({ maxLength: FEEDBACK_LIMITS.PAGE_MAX, example: '/account/jobs/new' })
  page?: string;
}

export class ReplyFeedbackDto {
  @Transform(trimText)
  @IsString()
  @Length(FEEDBACK_LIMITS.REPLY_MIN, FEEDBACK_LIMITS.REPLY_MAX, {
    message: `Ответ: от ${FEEDBACK_LIMITS.REPLY_MIN} до ${FEEDBACK_LIMITS.REPLY_MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Ответ содержит недопустимые символы' })
  @ApiProperty({ minLength: FEEDBACK_LIMITS.REPLY_MIN, maxLength: FEEDBACK_LIMITS.REPLY_MAX })
  reply!: string;
}

export const FEEDBACK_FILTERS = ['open', 'answered'] as const;
export type FeedbackFilter = (typeof FEEDBACK_FILTERS)[number];

export class ListFeedbackQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(FEEDBACK_FILTERS)
  @ApiPropertyOptional({
    enum: FEEDBACK_FILTERS,
    description: 'open — без ответа, answered — с ответом; по умолчанию — все',
  })
  status?: FeedbackFilter;
}
