import { describe, expect, it } from 'vitest';
import { planNotice } from './plan-notice';

describe('planNotice', () => {
  it('maps known actions to a message and ignores the rest', () => {
    expect(planNotice('proposed')).toBe('План отправлен на согласование.');
    expect(planNotice('accepted')).toBe('Этап принят.');
    expect(planNotice('unknown')).toBeNull();
    expect(planNotice(['saved', 'approved'])).toBeNull();
    expect(planNotice(undefined)).toBeNull();
  });
});
