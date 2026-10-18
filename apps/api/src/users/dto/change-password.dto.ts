import { AUTH_LIMITS } from '@agregator/shared';
import { IsString, Length, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(AUTH_LIMITS.PASSWORD_MAX)
  @ApiProperty({ maxLength: AUTH_LIMITS.PASSWORD_MAX })
  currentPassword!: string;

  @IsString()
  @Length(AUTH_LIMITS.PASSWORD_MIN, AUTH_LIMITS.PASSWORD_MAX, {
    message: `Пароль должен содержать от ${AUTH_LIMITS.PASSWORD_MIN} до ${AUTH_LIMITS.PASSWORD_MAX} символов`,
  })
  @ApiProperty({ minLength: AUTH_LIMITS.PASSWORD_MIN, maxLength: AUTH_LIMITS.PASSWORD_MAX })
  newPassword!: string;
}
