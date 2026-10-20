import { PLAN_LIMITS, PLAN_PARTIES, QUIT_REASON_LIMITS, type PlanParty } from '@agregator/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MULTI_LINE, MULTI_LINE_OR_EMPTY, SINGLE_LINE, trim, trimText } from '../../common/text';

/** Версия плана, которую видел пользователь: переход по устаревшей версии — 409. */
export class PlanVersionDto {
  @IsInt({ message: 'Версия плана — целое число' })
  @Min(0, { message: 'Версия плана не может быть отрицательной' })
  @ApiProperty({ type: 'integer', minimum: 0 })
  version!: number;
}

export class StageInputDto {
  @Transform(trim)
  @IsString()
  @Length(PLAN_LIMITS.TITLE_MIN, PLAN_LIMITS.TITLE_MAX, {
    message: `Название этапа: от ${PLAN_LIMITS.TITLE_MIN} до ${PLAN_LIMITS.TITLE_MAX} символов`,
  })
  @Matches(SINGLE_LINE, { message: 'Название этапа содержит недопустимые символы' })
  @ApiProperty({ minLength: PLAN_LIMITS.TITLE_MIN, maxLength: PLAN_LIMITS.TITLE_MAX })
  title!: string;

  @Transform(trimText)
  @IsString()
  @MaxLength(PLAN_LIMITS.DESCRIPTION_MAX, {
    message: `Описание этапа: не больше ${PLAN_LIMITS.DESCRIPTION_MAX} символов`,
  })
  @Matches(MULTI_LINE_OR_EMPTY, { message: 'Описание этапа содержит недопустимые символы' })
  @ApiProperty({ maxLength: PLAN_LIMITS.DESCRIPTION_MAX })
  description: string = '';

  @IsOptional()
  @ValidateIf((_: unknown, value: unknown) => value !== null)
  @IsInt({ message: 'Срок этапа указывается целым числом дней' })
  @Min(1, { message: 'Срок этапа: не меньше 1 дня' })
  @Max(PLAN_LIMITS.DURATION_MAX_DAYS, {
    message: `Срок этапа: не больше ${PLAN_LIMITS.DURATION_MAX_DAYS} дней`,
  })
  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: PLAN_LIMITS.DURATION_MAX_DAYS,
  })
  durationDays: number | null = null;
}

/** Черновик плана целиком (составитель). Пустой список этапов допустим в черновике. */
export class SavePlanDto extends PlanVersionDto {
  @IsBoolean({ message: 'Порядок этапов: да или нет' })
  @ApiProperty({ description: 'true — этапы сдаются строго по порядку' })
  sequential!: boolean;

  @IsArray({ message: 'Этапы передаются списком' })
  @ArrayMaxSize(PLAN_LIMITS.STAGES_MAX, {
    message: `Этапов не больше ${PLAN_LIMITS.STAGES_MAX}`,
  })
  @ValidateNested({ each: true })
  @Type(() => StageInputDto)
  @ApiProperty({ type: [StageInputDto], maxItems: PLAN_LIMITS.STAGES_MAX })
  stages!: StageInputDto[];
}

/** Кто составляет план (меняет заказчик, пока план не отправлен). */
export class PlanAuthorDto extends PlanVersionDto {
  @IsIn(PLAN_PARTIES, { message: 'Составитель плана: заказчик или исполнитель' })
  @ApiProperty({ enum: PLAN_PARTIES, enumName: 'PlanParty' })
  author!: PlanParty;
}

/** Причина или комментарий: возврат плана, сдача этапа, доработка. */
export class PlanCommentDto {
  @Transform(trimText)
  @IsString()
  @Length(PLAN_LIMITS.COMMENT_MIN, PLAN_LIMITS.COMMENT_MAX, {
    message: `Комментарий: от ${PLAN_LIMITS.COMMENT_MIN} до ${PLAN_LIMITS.COMMENT_MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Комментарий содержит недопустимые символы' })
  @ApiProperty({ minLength: PLAN_LIMITS.COMMENT_MIN, maxLength: PLAN_LIMITS.COMMENT_MAX })
  comment!: string;
}

export class ReturnPlanDto extends PlanVersionDto {
  @Transform(trimText)
  @IsString()
  @Length(PLAN_LIMITS.COMMENT_MIN, PLAN_LIMITS.COMMENT_MAX, {
    message: `Что изменить: от ${PLAN_LIMITS.COMMENT_MIN} до ${PLAN_LIMITS.COMMENT_MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Комментарий содержит недопустимые символы' })
  @ApiProperty({ minLength: PLAN_LIMITS.COMMENT_MIN, maxLength: PLAN_LIMITS.COMMENT_MAX })
  reason!: string;
}

/** Отказ исполнителя от заказа после выбора. */
export class QuitJobDto {
  @Transform(trimText)
  @IsString()
  @Length(QUIT_REASON_LIMITS.MIN, QUIT_REASON_LIMITS.MAX, {
    message: `Причина: от ${QUIT_REASON_LIMITS.MIN} до ${QUIT_REASON_LIMITS.MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Причина содержит недопустимые символы' })
  @ApiProperty({ minLength: QUIT_REASON_LIMITS.MIN, maxLength: QUIT_REASON_LIMITS.MAX })
  reason!: string;
}
