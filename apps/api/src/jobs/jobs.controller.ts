import type { JobDto, Paginated } from '@agregator/shared';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListJobsQuery } from './dto/list-jobs.query';
import { JobsService } from './jobs.service';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../openapi/decorators';
import { JobSchema, PaginatedJobSchema } from '../openapi/schemas';

@ApiTags('jobs')
@ApiErrors(429)
@Controller('v1/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedJobSchema })
  @ApiErrors(400)
  list(@Query() query: ListJobsQuery): Promise<Paginated<JobDto>> {
    return this.jobs.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: JobSchema })
  @ApiErrors(404)
  getById(@Param('id') id: string): Promise<JobDto> {
    return this.jobs.getById(id);
  }
}
