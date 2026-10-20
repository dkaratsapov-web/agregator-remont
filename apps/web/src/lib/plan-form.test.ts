import { describe, expect, it } from 'vitest';
import { parsePlanForm, stageField } from './plan-form';

function form(
  rows: Record<number, Partial<Record<'title' | 'description' | 'durationDays', string>>>,
  sequential = true,
) {
  const data = new FormData();
  if (sequential) data.set('sequential', 'on');
  for (const [row, values] of Object.entries(rows)) {
    for (const [name, value] of Object.entries(values)) {
      data.set(stageField(Number(row), name as 'title'), value ?? '');
    }
  }
  return data;
}

describe('parsePlanForm', () => {
  it('collects filled rows in order and skips empty ones', () => {
    const parsed = parsePlanForm(
      form({
        0: { title: ' Демонтаж ', durationDays: '2' },
        1: {},
        2: { title: 'Плитка', description: 'Пол и стены' },
      }),
      3,
      true,
    );
    expect(parsed).toEqual({
      ok: true,
      input: {
        version: 3,
        sequential: true,
        stages: [
          { title: 'Демонтаж', description: '', durationDays: 2 },
          { title: 'Плитка', description: 'Пол и стены', durationDays: null },
        ],
      },
      values: expect.any(Object),
    });
  });

  it('reports errors on the row fields', () => {
    const parsed = parsePlanForm(
      form({
        0: { title: 'ab' },
        1: { title: 'Этап', durationDays: '0' },
        2: { description: 'без названия' },
      }),
      1,
      false,
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(Object.keys(parsed.fields)).toEqual([
      stageField(0, 'title'),
      stageField(1, 'durationDays'),
      stageField(2, 'title'),
    ]);
    expect(parsed.error).toContain('Название этапа');
  });

  it('a draft can be empty, a proposal needs at least one stage', () => {
    expect(parsePlanForm(form({}), 0, false).ok).toBe(true);
    const proposal = parsePlanForm(form({}), 0, true);
    expect(proposal).toMatchObject({
      ok: false,
      fields: { stages: 'Добавьте в план хотя бы один этап.' },
    });
  });

  it('reads the order setting', () => {
    const parsed = parsePlanForm(form({ 0: { title: 'Этап один' } }, false), 0, true);
    expect(parsed.ok && parsed.input.sequential).toBe(false);
  });

  it('rejects a duration that is not a whole number of days', () => {
    for (const days of ['1.5', '-1', '366', 'два']) {
      const parsed = parsePlanForm(
        form({ 0: { title: 'Этап один', durationDays: days } }),
        0,
        true,
      );
      expect(parsed.ok).toBe(false);
    }
  });
});
