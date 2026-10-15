import type { UserDto } from '@agregator/shared';
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { SessionGuard } from '../auth/session.guard';
import { toUserDto } from './user.mapper';

@Controller('v1/me')
@UseGuards(SessionGuard)
export class MeController {
  @Get()
  me(@CurrentAuth() auth: AuthContext): UserDto {
    return toUserDto(auth.user);
  }
}
