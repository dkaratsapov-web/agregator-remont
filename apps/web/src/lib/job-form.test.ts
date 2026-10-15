import { describe, expect, it } from 'vitest';
import { formatAmount } from './format';
import { parseBudget, parseJobForm } from './job-form';

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};

const base = {
  title: 'Укладка плитки',
  description: 'Нужно уложить плитку в ванной, около 20 м².',
  category: 'TILING',
  city: 'Москва',
  budgetMin: '40 000',
  budgetMax: '60\u00a0000',
};

describe('parseBudget', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['120000', 120000],
    ['120 000', 120000],
    ['0', 0],
  ])('%j -> %j', (raw, expected) => {
    expect(parseBudget(raw)).toBe(expected);
  });

  it('round-trips formatted amounts used to prefill the edit form', () => {
    expect(parseBudget(formatAmount(1_250_000))).toBe(1_250_000);
  });

  it.each(['-5', '1.5', '1,5', '12e3', 'abc', '99999999999'])('%j is invalid', (raw) => {
    expect(parseBudget(raw)).toBe('invalid');
  });
});

describe('parseJobForm', () => {
  it('builds API input with numeric budgets', () => {
    const result = parseJobForm(form(base));
    expect(result).toMatchObject({
      ok: true,
      input: { category: 'TILING', budgetMin: 40000, budgetMax: 60000 },
    });
  });

  it('keeps typed values on errors', () => {
    const result = parseJobForm(form({ ...base, budgetMin: '70000' }));
    expect(result.ok).toBe(false);
    expect(result.values.title).toBe(base.title);
  });

  it('rejects unknown categories and non-numeric budgets', () => {
    expect(parseJobForm(form({ ...base, category: 'GARDENING' })).ok).toBe(false);
    expect(parseJobForm(form({ ...base, budgetMax: 'дорого' })).ok).toBe(false);
  });

  it('never forwards fields outside the form contract', () => {
    const result = parseJobForm(form({ ...base, ownerId: 'u2', status: 'CLOSED' }));
    expect(result.ok && Object.keys(result.input).sort()).toEqual([
      'budgetMax',
      'budgetMin',
      'category',
      'city',
      'description',
      'title',
    ]);
  });
});
