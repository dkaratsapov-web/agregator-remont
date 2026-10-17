import {
  flattenJobQuestions,
  formatJobNumber,
  groupJobDetails,
  JOB_CATEGORIES,
  JOB_DETAILS_LIMITS,
  JOB_QUESTIONNAIRES,
  jobDetailHighlights,
  jobDetailsProgress,
  summarizeJobDetails,
  validateJobDetails,
  visibleJobQuestionIds,
  type JobDetails,
  type JobQuestion,
} from '@agregator/shared';
import { describe, expect, it } from 'vitest';

const NNBSP = String.fromCharCode(0x202f);

const ok = (result: ReturnType<typeof validateJobDetails>): JobDetails => {
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return result.details;
};
const errorsOf = (result: ReturnType<typeof validateJobDetails>) => {
  if (result.ok) throw new Error('expected errors');
  return result.errors;
};

/** Минимальные ответы на все обязательные вопросы верхнего уровня. */
const REPAIR_BASE = {
  objectType: 'apartment',
  housing: 'new',
  newState: 'concrete',
  area: 54,
  repairLevel: 'capital',
};

describe('questionnaire schema', () => {
  it.each(JOB_CATEGORIES)('%s has 6-12 top-level questions and nested branches', (category) => {
    const top = JOB_QUESTIONNAIRES[category].sections.flatMap((section) => section.questions);
    expect(top.length).toBeGreaterThanOrEqual(6);
    expect(top.length).toBeLessThanOrEqual(12);
    const flat = flattenJobQuestions(category);
    expect(flat.some((item) => item.depth > 0)).toBe(true);
    expect(JOB_QUESTIONNAIRES[category].category).toBe(category);
  });

  it.each(JOB_CATEGORIES)(
    '%s: ids are unique and conditions point to earlier questions',
    (category) => {
      const flat = flattenJobQuestions(category);
      const seen = new Map<string, JobQuestion>();
      for (const { question, parentId } of flat) {
        expect(seen.has(question.id), `duplicate id ${question.id}`).toBe(false);
        expect(question.id).toMatch(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/);
        const ref = question.showIf?.q ?? parentId;
        if (question.showIf) {
          expect(ref, `${question.id}: showIf without a target`).not.toBeNull();
          const target = seen.get(ref!);
          expect(target, `${question.id}: showIf refers to unknown or later ${ref}`).toBeDefined();
          for (const value of question.showIf.in ?? []) {
            expect(
              target!.type === 'single' || target!.type === 'multi'
                ? target!.options.some((option) => option.value === value)
                : false,
              `${question.id}: option ${value} is not in ${ref}`,
            ).toBe(true);
          }
          if (question.showIf.is !== undefined) expect(target!.type).toBe('boolean');
          if (question.showIf.min !== undefined || question.showIf.max !== undefined) {
            expect(target!.type).toBe('number');
          }
        }
        if (question.type === 'single' || question.type === 'multi') {
          const values = question.options.map((option) => option.value);
          expect(new Set(values).size).toBe(values.length);
          expect(values.length).toBeGreaterThanOrEqual(2);
        }
        if (question.type === 'number') {
          expect(question.min).toBeLessThan(question.max);
          expect(question.unit.length).toBeGreaterThan(0);
        }
        seen.set(question.id, question);
      }
    },
  );

  it('copy has no em dashes', () => {
    expect(JSON.stringify(JOB_QUESTIONNAIRES)).not.toContain(String.fromCharCode(0x2014));
  });

  it('a fully answered questionnaire fits the size limit', () => {
    for (const category of JOB_CATEGORIES) {
      const answers: Record<string, unknown> = {};
      for (const { question } of flattenJobQuestions(category)) {
        if (question.type === 'single') answers[question.id] = question.options[0].value;
        if (question.type === 'multi') {
          answers[question.id] = question.options
            .slice(0, question.maxSelected ?? question.options.length)
            .map((option) => option.value);
        }
        if (question.type === 'number') answers[question.id] = question.max;
        if (question.type === 'boolean') answers[question.id] = true;
        if (question.type === 'text') answers[question.id] = 'я'.repeat(question.maxLength ?? 200);
      }
      const result = validateJobDetails(category, answers, { lenient: true });
      expect(JSON.stringify(result.ok && result.details).length).toBeLessThan(
        JOB_DETAILS_LIMITS.MAX_BYTES / 2,
      );
    }
  });
});

describe('validateJobDetails', () => {
  it('accepts valid answers and orders them like the questionnaire', () => {
    const details = ok(
      validateJobDetails('REPAIR_TURNKEY', {
        start: 'month',
        works: ['warmFloor', 'electrics'],
        warmFloorType: 'water',
        ...REPAIR_BASE,
      }),
    );
    expect(Object.keys(details)).toEqual([
      'objectType',
      'housing',
      'newState',
      'area',
      'repairLevel',
      'works',
      'warmFloorType',
      'start',
    ]);
    expect(details.works).toEqual(['electrics', 'warmFloor']);
  });

  it('opens nested branches: secondary housing with old repair asks about demolition', () => {
    const details = ok(
      validateJobDetails('REPAIR_TURNKEY', {
        ...REPAIR_BASE,
        housing: 'secondary',
        newState: undefined,
        oldState: 'old',
        demolition: ['tiles', 'walls', 'tiles'],
        debrisRemoval: true,
        buildingType: 'panel',
      }),
    );
    expect(details).toMatchObject({
      housing: 'secondary',
      oldState: 'old',
      demolition: ['walls', 'tiles'],
      debrisRemoval: true,
      buildingType: 'panel',
    });
    expect(details).not.toHaveProperty('newState');
  });

  it('strips answers to hidden questions instead of failing', () => {
    const details = ok(
      validateJobDetails('REPAIR_TURNKEY', {
        ...REPAIR_BASE,
        oldState: 'old', // ветка вторички не раскрыта
        demolition: ['walls'],
        houseFloors: 2, // тип объекта не дом
        acUnits: 3, // кондиционеры не выбраны
        designScope: 'full', // дизайн-проект не нужен
      }),
    );
    for (const id of ['oldState', 'demolition', 'houseFloors', 'acUnits', 'designScope']) {
      expect(details).not.toHaveProperty(id);
    }
  });

  it('strips grandchildren when the middle of a branch is hidden', () => {
    const details = ok(
      validateJobDetails('PLUMBING', {
        task: 'leak',
        leakPlace: 'sink',
        fixtures: ['towelRail'],
        towelRailType: 'water',
        riserWork: true,
      }),
    );
    expect(details).toEqual({ task: 'leak', leakPlace: 'sink' });
  });

  it('enforces required visible questions, including nested ones', () => {
    const errors = errorsOf(validateJobDetails('REPAIR_TURNKEY', { objectType: 'apartment' }));
    expect(errors.map((error) => error.questionId)).toEqual(['housing', 'area', 'repairLevel']);
    expect(errors[0].message).toBe('Ответьте на вопрос «Рынок жилья»');

    const nested = errorsOf(validateJobDetails('REPAIR_TURNKEY', { ...REPAIR_BASE, newState: '' }));
    expect(nested.map((error) => error.questionId)).toEqual(['newState']);

    // Для дома вопрос о рынке жилья скрыт и не обязателен.
    ok(
      validateJobDetails('REPAIR_TURNKEY', {
        objectType: 'house',
        area: 120,
        repairLevel: 'capital',
      }),
    );
  });

  it('treats an empty object as missing everything required', () => {
    const result = validateJobDetails('PLUMBING', {});
    expect(errorsOf(result).map((error) => error.questionId)).toEqual(['task']);
    expect(result.ok === false && result.message).toBe('Ответьте на вопрос «Что нужно сделать»');
  });

  it('rejects unknown question ids', () => {
    const errors = errorsOf(validateJobDetails('TILING', { colour: 'red', rooms: ['wc'] }));
    expect(errors).toContainEqual({
      questionId: 'colour',
      message: 'Ответ на вопрос, которого нет в анкете',
    });
  });

  it('rejects questions from another category', () => {
    const errors = errorsOf(
      validateJobDetails('ELECTRICAL', { task: 'devices', covering: 'laminate' }),
    );
    expect(errors.map((error) => error.questionId)).toContain('covering');
  });

  it('rejects unknown options', () => {
    expect(errorsOf(validateJobDetails('ELECTRICAL', { task: 'magic' }))[0]).toEqual({
      questionId: 'task',
      message: '«Тип работ»: такого варианта нет',
    });
    expect(
      errorsOf(
        validateJobDetails('TILING', {
          rooms: ['wc', 'garage'],
          surfaces: ['floor'],
          tileType: 'mosaic',
        }),
      )[0].questionId,
    ).toBe('rooms');
  });

  it.each([
    ['single as number', { task: 1 }, 'task'],
    ['single as array', { task: ['full'] }, 'task'],
    ['multi as string', { task: 'devices', devices: 'sockets' }, 'devices'],
    ['multi with non-strings', { task: 'devices', devices: ['sockets', 2] }, 'devices'],
    ['number as string', { task: 'full', area: '50' }, 'area'],
    ['number as NaN', { task: 'full', area: Number.NaN }, 'area'],
    ['boolean as string', { task: 'devices', smartHome: 'true' }, 'smartHome'],
  ])('rejects wrong types: %s', (_name, input, id) => {
    const errors = errorsOf(validateJobDetails('ELECTRICAL', input));
    expect(errors.map((error) => error.questionId)).toContain(id);
  });

  it('checks number ranges and steps', () => {
    const base = { task: 'full' };
    expect(errorsOf(validateJobDetails('ELECTRICAL', { ...base, area: 4 }))[0].message).toBe(
      '«Площадь помещения»: от 5 до 2000 м²',
    );
    expect(errorsOf(validateJobDetails('ELECTRICAL', { ...base, area: 2001 }))[0].questionId).toBe(
      'area',
    );
    expect(errorsOf(validateJobDetails('ELECTRICAL', { ...base, area: 50.5 }))[0].message).toBe(
      '«Площадь помещения»: укажите целое число',
    );
    // Высота потолков: шаг 0,05.
    const finishing = { works: ['paint'] };
    expect(
      ok(validateJobDetails('FINISHING', { ...finishing, ceilingHeight: 2.75 })),
    ).toMatchObject({
      ceilingHeight: 2.75,
    });
    expect(
      errorsOf(validateJobDetails('FINISHING', { ...finishing, ceilingHeight: 2.753 }))[0].message,
    ).toBe('«Высота потолков»: слишком много знаков после запятой');
    // Числа с плавающей точкой нормализуются: 0.1 * 32 → 3.2.
    expect(
      ok(
        validateJobDetails('TILING', {
          rooms: ['apron'],
          apronLength: 0.1 * 32,
          surfaces: ['walls'],
          tileType: 'ceramic',
        }),
      ).apronLength,
    ).toBe(3.2);
  });

  it('normalizes and limits text answers', () => {
    const base = { workType: 'other' };
    expect(
      ok(validateJobDetails('OTHER', { ...base, otherTask: '  заменить\n\tдоводчик   двери ' }))
        .otherTask,
    ).toBe('заменить доводчик двери');
    expect(
      errorsOf(validateJobDetails('OTHER', { ...base, otherTask: 'я'.repeat(121) }))[0].message,
    ).toBe('«Что именно нужно сделать»: не больше 120 символов');
    expect(
      errorsOf(
        validateJobDetails('OTHER', { ...base, otherTask: `abc${String.fromCharCode(0)}` }),
      )[0].message,
    ).toBe('«Что именно нужно сделать»: недопустимые символы');
    expect(
      errorsOf(
        validateJobDetails('OTHER', { ...base, otherTask: `a${String.fromCharCode(0x202e)}b` }),
      )[0].questionId,
    ).toBe('otherTask');
    // Пустой текст: обязательный вопрос без ответа.
    expect(errorsOf(validateJobDetails('OTHER', { ...base, otherTask: '   ' }))[0].message).toBe(
      'Ответьте на вопрос «Что именно нужно сделать»',
    );
  });

  it('enforces maxSelected for multi questions', () => {
    const base = { objectType: 'apartment', area: 70, scope: 'concept' };
    ok(validateJobDetails('DESIGN', { ...base, style: ['loft', 'minimal', 'modern'] }));
    expect(
      errorsOf(
        validateJobDetails('DESIGN', { ...base, style: ['loft', 'minimal', 'modern', 'scandi'] }),
      )[0].message,
    ).toBe('«Стиль»: можно выбрать не больше 3');
  });

  it('supports boolean and number conditions', () => {
    const flooring = { covering: 'laminate', area: 40 };
    expect(
      ok(validateJobDetails('FLOORING', { ...flooring, warmFloor: true, warmFloorType: 'film' })),
    ).toMatchObject({ warmFloor: true, warmFloorType: 'film' });
    expect(
      ok(validateJobDetails('FLOORING', { ...flooring, warmFloor: false, warmFloorType: 'film' })),
    ).not.toHaveProperty('warmFloorType');

    const other = { workType: 'furniture', objectType: 'apartment' };
    expect(
      ok(validateJobDetails('OTHER', { ...other, floor: 1, freightLift: true })),
    ).not.toHaveProperty('freightLift');
    expect(
      ok(validateJobDetails('OTHER', { ...other, floor: 9, freightLift: true })),
    ).toMatchObject({
      freightLift: true,
    });
  });

  it('treats null and empty values as no answer', () => {
    const details = ok(
      validateJobDetails('ELECTRICAL', {
        task: 'devices',
        devices: [],
        smartHome: null,
        rooms: '',
      }),
    );
    expect(details).toEqual({ task: 'devices' });
  });

  it('rejects non-object input and too many keys', () => {
    for (const input of [[], 'x', 5, true, new Date()]) {
      expect(errorsOf(validateJobDetails('OTHER', input))[0].questionId).toBeNull();
    }
    const many = Object.fromEntries(
      Array.from({ length: JOB_DETAILS_LIMITS.MAX_KEYS + 1 }, (_, i) => [`k${i}`, 'x']),
    );
    expect(errorsOf(validateJobDetails('OTHER', many))[0].message).toBe('Слишком много ответов');
  });

  it('is not fooled by prototype keys', () => {
    const input = JSON.parse('{"workType":"furniture","__proto__":{"objectType":"house"}}');
    const result = validateJobDetails('OTHER', input);
    expect(errorsOf(result).map((error) => error.questionId)).toEqual(['__proto__']);
    const lenient = ok(validateJobDetails('OTHER', input, { lenient: true }));
    expect(lenient).toEqual({ workType: 'furniture' });
    expect(Object.getPrototypeOf(lenient)).toBe(Object.prototype);
  });

  it('lenient mode drops invalid and unknown answers and skips required checks', () => {
    expect(
      ok(
        validateJobDetails(
          'REPAIR_TURNKEY',
          { objectType: 'apartment', area: 'много', works: ['ac', 'pool'], colour: 'red' },
          { lenient: true },
        ),
      ),
    ).toEqual({ objectType: 'apartment' });
    expect(ok(validateJobDetails('REPAIR_TURNKEY', null, { lenient: true }))).toEqual({});
    expect(ok(validateJobDetails('REPAIR_TURNKEY', 'oops', { lenient: true }))).toEqual({});
  });

  it('lenient mode keeps answers that fit another category (category change)', () => {
    const plumbing = { task: 'pipes', pipesScope: ['water'], objectType: 'house', start: 'week' };
    expect(ok(validateJobDetails('ELECTRICAL', plumbing, { lenient: true }))).toEqual({
      objectType: 'house',
      start: 'week',
    });
  });
});

describe('visibility and progress', () => {
  it('ignores stale answers to hidden questions', () => {
    const answers = { objectType: 'house', housing: 'secondary', oldState: 'old' };
    const visible = visibleJobQuestionIds('REPAIR_TURNKEY', answers);
    expect(visible.has('houseMaterial')).toBe(true);
    expect(visible.has('housing')).toBe(false);
    expect(visible.has('oldState')).toBe(false);
    expect(visible.has('demolition')).toBe(false);
  });

  it('counts answered visible questions', () => {
    const empty = jobDetailsProgress('REPAIR_TURNKEY', {});
    expect(empty.answered).toBe(0);
    const filled = jobDetailsProgress('REPAIR_TURNKEY', { ...REPAIR_BASE });
    expect(filled.answered).toBe(5);
    expect(filled.total).toBeGreaterThan(empty.total);
  });
});

describe('summarizeJobDetails', () => {
  it('returns ordered label/value pairs with sections and depth', () => {
    const items = summarizeJobDetails('REPAIR_TURNKEY', {
      ...REPAIR_BASE,
      area: 1250,
      works: ['ac', 'electrics'],
      acUnits: 3,
      living: false,
      contract: true,
    });
    expect(items.map((item) => [item.label, item.value])).toEqual([
      ['Тип объекта', 'Квартира'],
      ['Рынок жилья', 'Новостройка'],
      ['В каком состоянии сдана квартира', 'Бетон без отделки'],
      ['Площадь', '1250 м²'],
      ['Какой ремонт нужен', 'Капитальный'],
      ['Что входит в работы', 'Замена электрики, Кондиционеры'],
      ['Сколько кондиционеров', '3 шт.'],
      ['Будете жить в квартире во время ремонта', 'Нет'],
      ['Нужен договор и закрывающие документы', 'Да'],
    ]);
    expect(items[2].depth).toBe(1);
    expect(items[5].values).toEqual(['Замена электрики', 'Кондиционеры']);
    const sections = groupJobDetails(items);
    expect(sections.map((section) => [section.title, section.items.length])).toEqual([
      ['Объект', 4],
      ['Объём работ', 3],
      ['Сроки и условия', 2],
    ]);
  });

  it('uses custom yes/no labels and skips invalid or hidden answers', () => {
    const items = summarizeJobDetails('FLOORING', {
      covering: 'laminate',
      baseState: 'wood',
      joistsOk: false,
      warmFloorType: 'film',
      area: 'сорок',
    });
    expect(items.map((item) => item.value)).toEqual([
      'Ламинат',
      'Деревянный пол на лагах',
      'Нет, нужно чинить',
    ]);
    expect(summarizeJobDetails('FLOORING', 'garbage')).toEqual([]);
  });
});

describe('jobDetailHighlights', () => {
  it('picks short labels of key answers by priority', () => {
    expect(
      jobDetailHighlights('REPAIR_TURNKEY', {
        ...REPAIR_BASE,
        rooms: '2',
        designProject: 'need',
      }),
    ).toEqual(['54 м²', 'Новостройка', 'Бетон', '2-комнатная']);
  });

  it('formats multi answers compactly and boolean answers only when true', () => {
    expect(
      jobDetailHighlights('PLUMBING', {
        task: 'fixtures',
        fixtures: ['toilet', 'sink', 'mixer', 'heater'],
        points: 6,
      }),
    ).toEqual(['Установка приборов', 'Унитаз, Раковина и ещё 2', 'Точек: 6']);
    expect(
      jobDetailHighlights('PLUMBING', { task: 'leak', leakPlace: 'riser', urgent: true }),
    ).toEqual(['Срочный выезд', 'Протечка или засор']);
    expect(
      jobDetailHighlights('FLOORING', { covering: 'parquet', area: 30, warmFloor: false }),
    ).toEqual(['Паркет', '30 м²']);
  });

  it('prefixes numbers that need context', () => {
    expect(
      jobDetailHighlights('TILING', {
        rooms: ['bathroom'],
        surfaces: ['floor', 'walls'],
        floorArea: 4,
        wallArea: 22.5,
        tileType: 'porcelain',
      }),
    ).toEqual(['Ванная', 'Пол 4 м²', 'Стены 22,5 м²', 'Керамогранит']);
    expect(
      jobDetailHighlights('WINDOWS_DOORS', {
        items: ['pvc', 'interior'],
        windowsCount: 3,
        interiorCount: 2,
      }),
    ).toEqual(['Окна ПВХ, Межкомнатные двери', 'Окон: 3', 'Дверей: 2']);
  });

  it('respects the limit and survives bad data', () => {
    expect(jobDetailHighlights('REPAIR_TURNKEY', { ...REPAIR_BASE, rooms: '2' }, 2)).toHaveLength(
      2,
    );
    expect(jobDetailHighlights('REPAIR_TURNKEY', undefined)).toEqual([]);
  });
});

describe('formatJobNumber', () => {
  it.each([
    [5, '5'],
    [2.7, '2,7'],
    [1250, '1250'],
    [12500, `12${NNBSP}500`],
    [1000000, `1${NNBSP}000${NNBSP}000`],
  ])('%d -> %s', (value, expected) => {
    expect(formatJobNumber(value)).toBe(expected);
  });
});
