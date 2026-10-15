import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobBidsController, MyBidsController, OwnerBidsController } from './bids.controller';
import { BidsService } from './bids.service';

@Module({
  imports: [AuthModule],
  controllers: [JobBidsController, MyBidsController, OwnerBidsController],
  providers: [BidsService],
  exports: [BidsService],
})
export class BidsModule {}
