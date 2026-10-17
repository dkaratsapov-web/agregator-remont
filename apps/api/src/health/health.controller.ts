import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthSchema } from '../openapi/schemas';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @SkipThrottle()
  @ApiOkResponse({ type: HealthSchema })
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
