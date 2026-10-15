import { CURRENCIES, JOB_CATEGORIES, JOB_STATUSES, USER_ROLES } from '@agregator/shared';
import { Currency, JobCategory, JobStatus, UserRole } from '@prisma/client';

describe('shared contract ↔ Prisma enums', () => {
  it('keeps enum values in sync', () => {
    expect([...JOB_CATEGORIES].sort()).toEqual(Object.values(JobCategory).sort());
    expect([...JOB_STATUSES].sort()).toEqual(Object.values(JobStatus).sort());
    expect([...CURRENCIES].sort()).toEqual(Object.values(Currency).sort());
    expect([...USER_ROLES].sort()).toEqual(Object.values(UserRole).sort());
  });
});
