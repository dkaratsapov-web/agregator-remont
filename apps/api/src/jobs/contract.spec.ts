import { CURRENCIES, JOB_CATEGORIES, JOB_STATUSES } from '@agregator/shared';
import { Currency, JobCategory, JobStatus } from '@prisma/client';

describe('shared contract ↔ Prisma enums', () => {
  it('keeps enum values in sync', () => {
    expect([...JOB_CATEGORIES].sort()).toEqual(Object.values(JobCategory).sort());
    expect([...JOB_STATUSES].sort()).toEqual(Object.values(JobStatus).sort());
    expect([...CURRENCIES].sort()).toEqual(Object.values(Currency).sort());
  });
});
