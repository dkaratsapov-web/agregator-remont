import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQuery } from '../../jobs/dto/list-jobs.query';

export const LEAD_FILTERS = ['new', 'processed'] as const;
export type LeadFilter = (typeof LEAD_FILTERS)[number];

export class ListLeadsQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(LEAD_FILTERS)
  @ApiPropertyOptional({
    enum: LEAD_FILTERS,
    description: 'new — необработанные, processed — обработанные',
  })
  status?: LeadFilter;
}

export class UpdateLeadDto {
  @IsBoolean()
  @ApiProperty({ description: 'true — заявка обработана, false — вернуть в новые' })
  processed!: boolean;
}
