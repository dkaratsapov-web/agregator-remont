import type { LeadDto } from '@agregator/shared';
import type { Lead } from '@prisma/client';

export function toLeadDto(lead: Lead): LeadDto {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    createdAt: lead.createdAt.toISOString(),
    processedAt: lead.processedAt ? lead.processedAt.toISOString() : null,
  };
}
