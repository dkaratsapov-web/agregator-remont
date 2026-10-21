import type { AuthSessionDto } from '@agregator/shared';
import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthContext } from './auth.types';
import { CurrentAuth } from './current-auth.decorator';
import { LoginDto } from './dto/login.dto';
import { PasswordResetDto } from './dto/password-reset.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthRateLimited } from './rate-limit';
import { SessionGuard } from './session.guard';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrors, ApiSession } from '../openapi/decorators';
import { AuthSessionSchema } from '../openapi/schemas';

/**
 * User-Agent браузера, который передаёт web (сам web обращается к API со своим). Используется
 * только для подписи устройства в списке входов, на безопасность не влияет.
 */
const CLIENT_UA_HEADER = 'x-client-user-agent';

@ApiTags('auth')
@ApiErrors(429)
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @AuthRateLimited()
  @ApiCreatedResponse({ type: AuthSessionSchema })
  @ApiErrors(400, 409)
  register(
    @Body() dto: RegisterDto,
    @Headers(CLIENT_UA_HEADER) userAgent?: string,
  ): Promise<AuthSessionDto> {
    return this.auth.register(dto, userAgent);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimited()
  @ApiOkResponse({ type: AuthSessionSchema })
  @ApiErrors(400, 401, 403)
  login(
    @Body() dto: LoginDto,
    @Headers(CLIENT_UA_HEADER) userAgent?: string,
  ): Promise<AuthSessionDto> {
    return this.auth.login(dto, userAgent);
  }

  @Post('password-reset')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimited()
  @ApiOkResponse({ type: AuthSessionSchema, description: 'Пароль изменён, выполнен вход' })
  @ApiErrors(400, 403)
  resetPassword(
    @Body() dto: PasswordResetDto,
    @Headers(CLIENT_UA_HEADER) userAgent?: string,
  ): Promise<AuthSessionDto> {
    return this.auth.resetPassword(dto, userAgent);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @ApiSession()
  @ApiNoContentResponse({ description: 'Текущая сессия отозвана' })
  async logout(@CurrentAuth() auth: AuthContext): Promise<void> {
    await this.auth.logout(auth.sessionId);
  }
}
