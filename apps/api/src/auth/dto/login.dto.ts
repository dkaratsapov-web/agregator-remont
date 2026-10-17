import { AUTH_LIMITS } from '@agregator/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Укажите корректный email' })
  @MaxLength(AUTH_LIMITS.EMAIL_MAX)
  @ApiProperty({ format: 'email', maxLength: AUTH_LIMITS.EMAIL_MAX })
  email!: string;

  @IsString()
  @Length(1, AUTH_LIMITS.PASSWORD_MAX)
  @ApiProperty({ minLength: 1, maxLength: AUTH_LIMITS.PASSWORD_MAX })
  password!: string;
}
