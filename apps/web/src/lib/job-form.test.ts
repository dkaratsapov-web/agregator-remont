import { describe, expect, it } from 'vitest';
import { formatAmount } from './format';
import { SERVICE_AREA_ERROR } from '@agregator/shared';
import {
  checkJobForm,
  parseBudget,
  parseDetailsField,
  draftIdFrom,
  parseDraftForm,
  parseJobForm,
  readJobForm,
} from './job-form';

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
  details: JSON.stringify({
    rooms: ['bathroom'],
    surfaces: ['floor', 'walls'],
    floorArea: 4,
    tileType: 'porcelain',
  }),
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
      'details',
      'extraItems',
      'title',
    ]);
  });

  it('forwards normalized questionnaire answers', () => {
    const result = parseJobForm(
      form({
        ...base,
        details: JSON.stringify({
          surfaces: ['walls', 'floor'],
          rooms: ['bathroom'],
          tileType: 'porcelain',
          mosaicBase: 'mesh',
          start: 'week',
        }),
      }),
    );
    expect(result.ok && result.input.details).toEqual({
      rooms: ['bathroom'],
      surfaces: ['floor', 'walls'],
      tileType: 'porcelain',
      start: 'week',
    });
  });

  it('reports questionnaire errors with the question id and keeps the raw answers', () => {
    const details = JSON.stringify({ rooms: ['bathroom'], surfaces: ['floor'] });
    const result = parseJobForm(form({ ...base, details }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('Ответьте на вопрос «Материал»');
    expect(result.issues).toContainEqual({
      field: 'details',
      questionId: 'tileType',
      message: 'Ответьте на вопрос «Материал»',
    });
    expect(result.values.details).toBe(details);
  });

  it('rejects malformed or oversized answers', () => {
    const broken = parseJobForm(form({ ...base, details: '{"rooms":' }));
    expect(broken.ok === false && broken.error).toBe(
      'Ответы на вопросы переданы в неверном формате',
    );
    const huge = parseJobForm(form({ ...base, details: 'x'.repeat(20_000) }));
    expect(huge.ok === false && huge.error).toBe('Слишком длинные ответы на вопросы.');
  });

  it('accepts only cities from the service area and canonicalizes them', () => {
    const ok = parseJobForm(form({ ...base, city: ' королев ' }));
    expect(ok.ok && ok.input.city).toBe('Королёв');
    const outside = parseJobForm(form({ ...base, city: 'Казань' }));
    expect(outside.ok === false && outside.error).toBe(`${SERVICE_AREA_ERROR}.`);
    const empty = parseJobForm(form({ ...base, city: '' }));
    expect(empty.ok === false && empty.error).toBe('Выберите город из списка.');
  });
});

describe('checkJobForm', () => {
  it('collects issues for every invalid field', () => {
    const values = readJobForm(
      form({
        title: 'Окно',
        description: 'Коротко',
        category: '',
        city: 'Тверь',
        budgetMin: '9',
        budgetMax: '5',
        details: '',
      }),
    );
    const result = checkJobForm(values);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.map((issue) => issue.field)).toEqual([
      'title',
      'category',
      'city',
      'budget',
      'description',
    ]);
  });

  it('treats an empty details field as an empty questionnaire', () => {
    expect(parseDetailsField('')).toEqual({});
    expect(parseDetailsField('  ')).toEqual({});
    expect(parseDetailsField('[1]')).toEqual([1]);
    expect(parseDetailsField('nope')).toBe('nope');
    const result = checkJobForm(readJobForm(form({ ...base, category: 'OTHER', details: '' })));
    expect(!result.ok && result.issues).toEqual([
      { field: 'details', questionId: 'workType', message: 'Ответьте на вопрос «Что за работа»' },
    ]);
  });
});

describe('drafts', () => {
  it('keeps what is filled and turns blanks into null', () => {
    expect(parseDraftForm(form({ title: '  Плит ', description: '   ' }))).toEqual({
      title: 'Плит',
      description: null,
      category: null,
      city: null,
      budgetMin: null,
      budgetMax: null,
      details: {},
      extraItems: [],
    });
  });

  it('drops invalid values instead of failing', () => {
    const draft = parseDraftForm(
      form({
        title: 'Плитка\u202e в ванной\u0000',
        description: 'Строка 1\r\nСтрока 2\u200b',
        category: 'GARDENING',
        city: 'Казань',
        budgetMin: 'сорок тысяч',
        budgetMax: '60 000',
        details: '{битый json',
      }),
    );
    expect(draft).toEqual({
      title: 'Плитка в ванной',
      description: 'Строка 1\nСтрока 2',
      category: null,
      city: 'Казань',
      budgetMin: null,
      budgetMax: 60000,
      details: {},
      extraItems: [],
    });
  });

  it('passes the questionnaire answers through for the API to check', () => {
    expect(parseDraftForm(form(base)).details).toEqual(JSON.parse(base.details));
    expect(parseDraftForm(form({ ...base, details: '["rooms"]' })).details).toEqual({});
  });

  it('reads the draft id only when it looks like an id', () => {
    expect(draftIdFrom(form({ draftId: 'cm1abc_DEF-2' }))).toBe('cm1abc_DEF-2');
    expect(draftIdFrom(form({ draftId: '' }))).toBeNull();
    expect(draftIdFrom(form({ draftId: '../x' }))).toBeNull();
    expect(draftIdFrom(form({}))).toBeNull();
  });

  it('publishes with the draft id so the API removes the draft', () => {
    const parsed = parseJobForm(form({ ...base, draftId: 'cm1draft' }));
    expect(parsed.ok && parsed.input.draftId).toBe('cm1draft');
    const plain = parseJobForm(form(base));
    expect(plain.ok && 'draftId' in plain.input).toBe(false);
  });
});

describe('several categories', () => {
  const plumbing = { category: 'PLUMBING', details: { task: 'leak', leakPlace: 'riser' } };

  it('sends valid extra positions with normalized answers', () => {
    const result = parseJobForm(form({ ...base, extraItems: JSON.stringify([plumbing]) }));
    expect(result.ok && result.input.extraItems).toEqual([plumbing]);
  });

  it('reports a position without category and a repeated category by position number', () => {
    const result = parseJobForm(
      form({
        ...base,
        extraItems: JSON.stringify([{ category: null, details: {} }, { category: 'TILING' }]),
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.issues.filter((i) => i.field === 'items').map((i) => [i.position, i.message]),
    ).toEqual([
      [2, 'Позиция 2: выберите категорию'],
      [3, 'Категория «Плиточные работы» уже есть в заказе'],
    ]);
  });

  it('points to the question inside a position', () => {
    const result = parseJobForm(
      form({ ...base, extraItems: JSON.stringify([{ category: 'PLUMBING', details: {} }]) }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const issue = result.issues.find((i) => i.field === 'items');
    expect(issue).toMatchObject({ position: 2, questionId: 'task' });
  });

  it('keeps positions in a draft without checking them', () => {
    const items = [{ category: 'PLUMBING', details: {} }, { category: null }];
    expect(
      parseDraftForm(form({ title: 'Ванная', extraItems: JSON.stringify(items) })).extraItems,
    ).toEqual(items);
    expect(parseDraftForm(form({ extraItems: '{битый' })).extraItems).toEqual([]);
  });
});
