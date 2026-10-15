import type { AuthSessionDto } from '@agregator/shared';
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthContext } from './auth.types';
import { CurrentAuth } from './current-auth.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthRateLimited } from './rate-limit';
import { SessionGuard } from './session.guard';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @AuthRateLimited()
  register(@Body() dto: RegisterDto): Promise<AuthSessionDto> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimited()
  login(@Body() dto: LoginDto): Promise<AuthSessionDto> {
    return this.auth.login(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async logout(@CurrentAuth() auth: AuthContext): Promise<void> {
    await this.auth.logout(auth.sessionId);
  }
}
