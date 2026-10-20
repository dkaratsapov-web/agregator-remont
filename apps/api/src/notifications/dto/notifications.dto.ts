import { NOTIFICATION_LIMITS } from '@agregator/shared';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ENTITY_ID_PATTERN } from '../../common/text';

export class ListNotificationsQuery {
  /** id последнего уведомления предыдущей страницы. */
  @IsOptional()
  @IsString()
  @Matches(ENTITY_ID_PATTERN, { message: 'Неверный курсор' })
  @ApiPropertyOptional({ pattern: ENTITY_ID_PATTERN.source })
  cursor?: string;
}

/** Что отметить прочитанным: ровно одно из all, jobId, ids (проверяет сервис). */
export class MarkNotificationsReadDto {
  @IsOptional()
  @Equals(true, { message: 'all: только true' })
  @ApiPropertyOptional({ enum: [true], description: 'Все уведомления' })
  all?: true;

  @IsOptional()
  @IsString()
  @Matches(ENTITY_ID_PATTERN, { message: 'Неверный заказ' })
  @ApiPropertyOptional({ pattern: ENTITY_ID_PATTERN.source, description: 'Уведомления по заказу' })
  jobId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Укажите уведомления' })
  @ArrayMaxSize(NOTIFICATION_LIMITS.MARK_MAX, {
    message: `Не больше ${NOTIFICATION_LIMITS.MARK_MAX} уведомлений за раз`,
  })
  @ArrayUnique({ message: 'Уведомления повторяются' })
  @IsString({ each: true })
  @Matches(ENTITY_ID_PATTERN, { each: true, message: 'Неверное уведомление' })
  @ApiPropertyOptional({
    type: [String],
    maxItems: NOTIFICATION_LIMITS.MARK_MAX,
    description: 'Перечисленные уведомления',
  })
  ids?: string[];
}
