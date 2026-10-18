import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminLeadsController, LeadsController } from './leads.controller';
import { leadsEnabledProvider } from './leads.config';
import { LeadsService } from './leads.service';

@Module({
  imports: [AuthModule],
  controllers: [LeadsController, AdminLeadsController],
  providers: [LeadsService, leadsEnabledProvider],
})
export class LeadsModule {}
