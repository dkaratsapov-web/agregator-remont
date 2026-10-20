import {
  MODERATION_LIMITS,
  REPORT_FILTERS,
  REPORT_LIMITS,
  REPORT_REASONS,
  REPORT_TARGETS,
  type ReportFilter,
  type ReportReason,
  type ReportTarget,
} from '@agregator/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../jobs/dto/list-jobs.query';
import { ENTITY_ID_PATTERN, MULTI_LINE, MULTI_LINE_OR_EMPTY, trimText } from '../../common/text';

export class CreateReportDto {
  @IsIn(REPORT_TARGETS, { message: 'Пожаловаться можно на заказ, сообщение или отклик' })
  @ApiProperty({ enum: REPORT_TARGETS, enumName: 'ReportTarget' })
  targetType!: ReportTarget;

  @IsString()
  @Matches(ENTITY_ID_PATTERN, { message: 'Неверный предмет жалобы' })
  @ApiProperty({ pattern: ENTITY_ID_PATTERN.source })
  targetId!: string;

  @IsIn(REPORT_REASONS, { message: 'Выберите причину жалобы' })
  @ApiProperty({ enum: REPORT_REASONS, enumName: 'ReportReason' })
  reason!: ReportReason;

  /** Для «Другое» обязательно (проверяет сервис). */
  @Transform(trimText)
  @IsString()
  @MaxLength(REPORT_LIMITS.COMMENT_MAX, {
    message: `Пояснение: не больше ${REPORT_LIMITS.COMMENT_MAX} символов`,
  })
  @Matches(MULTI_LINE_OR_EMPTY, { message: 'Пояснение содержит недопустимые символы' })
  @ApiPropertyOptional({ maxLength: REPORT_LIMITS.COMMENT_MAX, default: '' })
  comment: string = '';
}

export class ListReportsQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(REPORT_FILTERS)
  @ApiPropertyOptional({ enum: REPORT_FILTERS, default: 'OPEN' })
  status: ReportFilter = 'OPEN';
}

export class ResolveReportDto {
  @IsIn(['RESOLVED', 'DISMISSED'], { message: 'Решение: меры приняты или нарушения нет' })
  @ApiProperty({ enum: ['RESOLVED', 'DISMISSED'] })
  status!: 'RESOLVED' | 'DISMISSED';

  @Transform(trimText)
  @IsString()
  @Length(MODERATION_LIMITS.REASON_MIN, REPORT_LIMITS.NOTE_MAX, {
    message: `Решение: от ${MODERATION_LIMITS.REASON_MIN} до ${REPORT_LIMITS.NOTE_MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Решение содержит недопустимые символы' })
  @ApiProperty({ minLength: MODERATION_LIMITS.REASON_MIN, maxLength: REPORT_LIMITS.NOTE_MAX })
  note!: string;
}

class ModerationReason {
  @Transform(trimText)
  @IsString()
  @Length(MODERATION_LIMITS.REASON_MIN, MODERATION_LIMITS.REASON_MAX, {
    message: `Причина: от ${MODERATION_LIMITS.REASON_MIN} до ${MODERATION_LIMITS.REASON_MAX} символов`,
  })
  @Matches(MULTI_LINE, { message: 'Причина содержит недопустимые символы' })
  @ApiProperty({
    minLength: MODERATION_LIMITS.REASON_MIN,
    maxLength: MODERATION_LIMITS.REASON_MAX,
    description: 'За что: попадает в журнал',
  })
  reason!: string;
}

export class HideDto extends ModerationReason {
  @IsBoolean()
  @ApiProperty({ description: 'true — скрыть, false — вернуть' })
  hidden!: boolean;
}

export class BlockDto extends ModerationReason {
  @IsBoolean()
  @ApiProperty({ description: 'true — заблокировать, false — разблокировать' })
  blocked!: boolean;
}
