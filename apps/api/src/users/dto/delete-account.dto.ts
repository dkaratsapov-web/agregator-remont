import { AUTH_LIMITS, type DeleteAccountInput } from '@agregator/shared';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class DeleteAccountDto implements DeleteAccountInput {
  @IsString()
  @Length(1, AUTH_LIMITS.PASSWORD_MAX, { message: 'Введите пароль' })
  @ApiProperty({ maxLength: AUTH_LIMITS.PASSWORD_MAX, description: 'Текущий пароль' })
  password!: string;
}
