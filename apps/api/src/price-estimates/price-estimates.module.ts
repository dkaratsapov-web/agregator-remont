import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PriceEstimatesController } from './price-estimates.controller';
import { PriceEstimatesService } from './price-estimates.service';

@Module({
  imports: [AuthModule],
  controllers: [PriceEstimatesController],
  providers: [PriceEstimatesService],
})
export class PriceEstimatesModule {}
