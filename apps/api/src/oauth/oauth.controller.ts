import type { AuthSessionDto } from '@agregator/shared';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { AuthRateLimited } from '../auth/rate-limit';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiSession } from '../openapi/decorators';
import {
  AuthSessionSchema,
  LinkedBankSchema,
  OAuthAuthorizeUrlSchema,
  OAuthNeedRoleSchema,
  OAuthProviderSchema,
} from '../openapi/schemas';
import { OAuthAuthorizeDto, OAuthCodeDto, OAuthCompleteDto, OAuthSignInDto } from './dto/oauth.dto';
import { OAuthService } from './oauth.service';

const CLIENT_UA_HEADER = 'x-client-user-agent';

/**
 * Вход и регистрация через банк (Сбер ID, Т-Банк ID). Браузер с API не говорит: web хранит
 * state, nonce и PKCE в своей cookie, отправляет человека в банк по адресу из authorize и
 * передаёт код из возврата сюда. Секреты банка и сертификат есть только у API.
 */
@ApiTags('auth')
@ApiErrors(429)
@Controller('v1/auth/oauth')
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Get('providers')
  @ApiOkResponse({ type: [OAuthProviderSchema], description: 'Банки, вход через которые настроен' })
  providers() {
    return this.oauth.providers();
  }

  @Post(':provider/authorize')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimited()
  @ApiOkResponse({ type: OAuthAuthorizeUrlSchema })
  @ApiErrors(400, 404)
  authorize(@Param('provider') provider: string, @Body() dto: OAuthAuthorizeDto) {
    return this.oauth.authorizeUrl(provider, dto);
  }

  @Post(':provider/callback')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimited()
  @ApiOkResponse({ type: AuthSessionSchema, description: 'Вход выполнен (или аккаунт создан)' })
  @ApiResponse({
    status: 409,
    type: OAuthNeedRoleSchema,
    description: 'OAUTH_NEED_ROLE: аккаунта нет, нужна роль; OAUTH_EMAIL_TAKEN: email уже занят',
  })
  @ApiErrors(400, 403, 404, 422, 502)
  callback(
    @Param('provider') provider: string,
    @Body() dto: OAuthSignInDto,
    @Headers(CLIENT_UA_HEADER) userAgent?: string,
  ): Promise<AuthSessionDto> {
    return this.oauth.signIn(provider, dto, userAgent);
  }

  @Post('complete')
  @AuthRateLimited()
  @ApiCreatedResponse({ type: AuthSessionSchema })
  @ApiErrors(400, 403, 409, 410)
  complete(
    @Body() dto: OAuthCompleteDto,
    @Headers(CLIENT_UA_HEADER) userAgent?: string,
  ): Promise<AuthSessionDto> {
    return this.oauth.complete(dto.pending, dto.role, userAgent);
  }
}

/** Банки, привязанные к аккаунту, и привязка нового (человек уже вошёл). */
@ApiTags('account')
@ApiErrors(429)
@Controller('v1/me/oauth')
@UseGuards(SessionGuard)
@ApiSession()
export class MeOAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Get()
  @ApiOkResponse({ type: [LinkedBankSchema] })
  linked(@CurrentAuth() auth: AuthContext) {
    return this.oauth.linked(auth.user.id);
  }

  @Post(':provider/link')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuthRateLimited()
  @ApiNoContentResponse({ description: 'Банк привязан (или уже был привязан к этому аккаунту)' })
  @ApiErrors(400, 404, 409, 502)
  async link(
    @CurrentAuth() auth: AuthContext,
    @Param('provider') provider: string,
    @Body() dto: OAuthCodeDto,
  ): Promise<void> {
    await this.oauth.link(auth.user.id, provider, dto);
  }
}
