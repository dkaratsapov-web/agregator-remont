import { SELF_SERVICE_ROLES, type SelfServiceRole } from '@agregator/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** state и nonce: случайные строки web (base64url), state у Сбера до 96 символов, nonce до 64. */
const STATE_RE = /^[A-Za-z0-9_-]{16,96}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
/** PKCE (RFC 7636): verifier 43–128 символов, challenge S256 — 43 символа base64url. */
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
/** Код авторизации банка: печатные ASCII без пробелов. */
const CODE_RE = /^[\x21-\x7e]{1,2048}$/;

export class OAuthAuthorizeDto {
  @IsString()
  @Matches(STATE_RE)
  @ApiProperty({ pattern: STATE_RE.source })
  state!: string;

  @IsString()
  @Matches(NONCE_RE)
  @ApiProperty({ pattern: NONCE_RE.source })
  nonce!: string;

  @IsString()
  @Matches(CHALLENGE_RE)
  @ApiProperty({ pattern: CHALLENGE_RE.source, description: 'PKCE S256' })
  codeChallenge!: string;
}

export class OAuthCodeDto {
  @IsString()
  @Matches(CODE_RE, { message: 'Некорректный код авторизации банка' })
  @ApiProperty()
  code!: string;

  @IsString()
  @Matches(VERIFIER_RE)
  @ApiProperty({ pattern: VERIFIER_RE.source })
  codeVerifier!: string;

  @IsString()
  @Matches(NONCE_RE)
  @ApiProperty({ pattern: NONCE_RE.source })
  nonce!: string;
}

export class OAuthSignInDto extends OAuthCodeDto {
  // ADMIN намеренно отсутствует, как и при регистрации по паролю.
  @IsOptional()
  @IsIn(SELF_SERVICE_ROLES, { message: 'Выберите роль: заказчик или подрядчик' })
  @ApiPropertyOptional({ enum: SELF_SERVICE_ROLES, enumName: 'SelfServiceRole' })
  role?: SelfServiceRole;
}

export class OAuthCompleteDto {
  @IsString()
  @MaxLength(4096)
  @ApiProperty({ description: 'Незавершённый вход из ответа OAUTH_NEED_ROLE' })
  pending!: string;

  @IsIn(SELF_SERVICE_ROLES, { message: 'Выберите роль: заказчик или подрядчик' })
  @ApiProperty({ enum: SELF_SERVICE_ROLES, enumName: 'SelfServiceRole' })
  role!: SelfServiceRole;
}
