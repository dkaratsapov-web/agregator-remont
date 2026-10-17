import type { UserDto } from '@agregator/shared';
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { SessionGuard } from '../auth/session.guard';
import { toUserDto } from './user.mapper';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrors, ApiSession } from '../openapi/decorators';
import { UserSchema } from '../openapi/schemas';

@ApiTags('me')
@ApiErrors(429)
@ApiSession()
@Controller('v1/me')
@UseGuards(SessionGuard)
export class MeController {
  @Get()
  @ApiOkResponse({ type: UserSchema })
  me(@CurrentAuth() auth: AuthContext): UserDto {
    return toUserDto(auth.user);
  }
}
