import { AUTH_LIMITS } from '@agregator/shared';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MaxLength } from 'class-validator';

export class PasswordResetDto {
  @IsString()
  @MaxLength(64)
  @ApiProperty({ description: 'Токен из ссылки /reset/<токен>', maxLength: 64 })
  token!: string;

  @IsString()
  @Length(AUTH_LIMITS.PASSWORD_MIN, AUTH_LIMITS.PASSWORD_MAX, {
    message: `Пароль должен содержать от ${AUTH_LIMITS.PASSWORD_MIN} до ${AUTH_LIMITS.PASSWORD_MAX} символов`,
  })
  @ApiProperty({ minLength: AUTH_LIMITS.PASSWORD_MIN, maxLength: AUTH_LIMITS.PASSWORD_MAX })
  password!: string;
}
