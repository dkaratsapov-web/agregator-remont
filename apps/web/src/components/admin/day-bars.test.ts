import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DayBars, formatDay } from './day-bars';

describe('DayBars', () => {
  const days = ['2026-10-20', '2026-10-21', '2026-10-22'];
  const render = (label: string, values: number[]) =>
    renderToStaticMarkup(createElement(DayBars, { label, days, values }));

  it('draws one bar per day with a hint and a summary for screen readers', () => {
    const html = render('Отклики', [0, 2, 4]);
    expect(html.match(/<rect/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Отклики по дням: больше всего 4 за день"');
    expect(html).toContain(`<title>${formatDay('2026-10-22')}: 4</title>`);
    // Нулевой день виден тонкой линией, а не пропадает.
    expect(html).toContain('class="fill-line"');
    expect(html.match(/class="fill-accent"/g)).toHaveLength(2);
  });

  it('says so when the period is empty', () => {
    expect(render('Отзывы', [0, 0, 0])).toContain('aria-label="Отзывы: за период ни одного"');
  });

  it('formats a Moscow day without shifting it', () => {
    expect(formatDay('2026-10-22')).toMatch(/^22 окт/);
  });
});
