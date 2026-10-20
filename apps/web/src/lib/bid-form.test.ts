import { describe, expect, it } from 'vitest';
import { parseBidForm, parseProfileForm, splitCities } from './bid-form';

const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
  return fd;
};

describe('parseBidForm', () => {
  it('parses price with spaces and optional duration', () => {
    expect(
      parseBidForm(form({ price: '38 000', durationDays: '', comment: 'Комментарий к отклику' })),
    ).toMatchObject({
      ok: true,
      input: { price: 38000, durationDays: null },
    });
    expect(
      parseBidForm(form({ price: '5000', durationDays: '7', comment: 'Комментарий' })),
    ).toMatchObject({
      input: { durationDays: 7 },
    });
  });

  it.each<[Record<string, string>, string]>([
    [{ price: '' }, 'missing price'],
    [{ price: 'дёшево' }, 'non-numeric price'],
    [{ price: '1000', durationDays: '0' }, 'zero duration'],
    [{ price: '1000', durationDays: '400' }, 'duration above limit'],
    [{ price: '1000', durationDays: '2.5' }, 'fractional duration'],
  ])('rejects %j (%s) keeping values', (fields, _reason) => {
    const result = parseBidForm(form({ comment: 'Комментарий', ...fields }));
    expect(result.ok).toBe(false);
    expect(result.values.comment).toBe('Комментарий');
  });

  it('reports every invalid field at once (UX-5)', () => {
    const result = parseBidForm(form({ price: 'дёшево', durationDays: '0', comment: 'мало' }));
    expect(!result.ok && Object.keys(result.fields).sort()).toEqual([
      'comment',
      'durationDays',
      'price',
    ]);
  });

  it('never forwards fields outside the form contract', () => {
    const result = parseBidForm(
      form({ price: '1000', comment: 'Комментарий', status: 'ACCEPTED', jobId: 'x' }),
    );
    expect(result.ok && Object.keys(result.input).sort()).toEqual([
      'comment',
      'durationDays',
      'price',
    ]);
  });
});

describe('parseProfileForm', () => {
  it('splits cities and dedupes categories', () => {
    const result = parseProfileForm(
      form({
        about: 'О себе',
        categories: ['TILING', 'TILING', 'FLOORING'],
        cities: 'Казань, Самара\nПермь',
        experienceYears: '12',
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      input: {
        categories: ['TILING', 'FLOORING'],
        cities: ['Казань', 'Самара', 'Пермь'],
        experienceYears: 12,
      },
    });
  });

  it('rejects unknown categories and bad experience', () => {
    expect(parseProfileForm(form({ categories: ['GARDENING'] })).ok).toBe(false);
    expect(parseProfileForm(form({ experienceYears: 'много' })).ok).toBe(false);
  });

  it('splitCities ignores empty items', () => {
    expect(splitCities(' , Казань,, \n ')).toEqual(['Казань']);
  });
});
