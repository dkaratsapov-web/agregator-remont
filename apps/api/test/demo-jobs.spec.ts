import { isServiceCity, validateJobDetails, type JobCategory } from '@agregator/shared';
import { DEMO_JOBS } from '../prisma/demo-jobs';

describe('demo seed', () => {
  it.each(DEMO_JOBS.map((job) => [job.id, job] as const))(
    '%s: city is in the service area and answers pass strict validation',
    (_id, job) => {
      expect(isServiceCity(job.city)).toBe(true);
      const details = (job.details ?? {}) as Record<string, unknown>;
      const result = validateJobDetails(job.category as JobCategory, details);
      if (Object.keys(details).length > 0) {
        expect(result).toEqual({ ok: true, details });
      }
    },
  );
});
