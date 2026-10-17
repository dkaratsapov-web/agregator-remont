import type { AuthSessionDto } from '@agregator/shared';
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthContext } from './auth.types';
import { CurrentAuth } from './current-auth.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthRateLimited } from './rate-limit';
import { SessionGuard } from './session.guard';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrors, ApiSession } from '../openapi/decorators';
import { AuthSessionSchema } from '../openapi/schemas';

@ApiTags('auth')
@ApiErrors(429)
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @AuthRateLimited()
  @ApiCreatedResponse({ type: AuthSessionSchema })
  @ApiErrors(400, 409)
  register(@Body() dto: RegisterDto): Promise<AuthSessionDto> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimited()
  @ApiOkResponse({ type: AuthSessionSchema })
  @ApiErrors(400, 401)
  login(@Body() dto: LoginDto): Promise<AuthSessionDto> {
    return this.auth.login(dto);
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
