import type { JobDto, Paginated } from '@agregator/shared';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListJobsQuery } from './dto/list-jobs.query';
import { JobsService } from './jobs.service';

@Controller('v1/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(@Query() query: ListJobsQuery): Promise<Paginated<JobDto>> {
    return this.jobs.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<JobDto> {
    return this.jobs.getById(id);
  }
}
