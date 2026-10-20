import { MESSAGE_LIMITS } from '@agregator/shared';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MULTI_LINE_OR_EMPTY, trimText } from '../../common/text';

/** Сообщение: текст и/или фото (файлы — в поле photos того же multipart-запроса). */
export class SendMessageDto {
  @Transform(trimText)
  @IsString()
  @MaxLength(MESSAGE_LIMITS.BODY_MAX, {
    message: `Сообщение: не больше ${MESSAGE_LIMITS.BODY_MAX} символов`,
  })
  @Matches(MULTI_LINE_OR_EMPTY, { message: 'Сообщение содержит недопустимые символы' })
  @ApiPropertyOptional({ maxLength: MESSAGE_LIMITS.BODY_MAX, default: '' })
  body: string = '';

  /** Ключ отправки из формы: повтор той же отправки возвращает уже отправленное. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'Неверный ключ отправки' })
  @ApiPropertyOptional({ pattern: '^[A-Za-z0-9_-]{8,64}$' })
  requestId?: string;
}
