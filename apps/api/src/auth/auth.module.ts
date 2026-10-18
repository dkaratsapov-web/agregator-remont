import { Module } from '@nestjs/common';
import { AccountService } from '../users/account.service';
import { MeController } from '../users/me.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles';
import { SessionGuard } from './session.guard';

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, AccountService, SessionGuard, RolesGuard],
  exports: [AuthService, SessionGuard, RolesGuard],
})
export class AuthModule {}
