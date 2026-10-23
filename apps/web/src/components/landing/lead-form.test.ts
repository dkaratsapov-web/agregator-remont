import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LeadForm } from './lead-form';

const render = (props: Parameters<typeof LeadForm>[0]) =>
  renderToStaticMarkup(createElement(LeadForm, props));

describe('LeadForm', () => {
  // Без JS форма без method отправилась бы GET-запросом: имя и телефон оказались бы в адресе,
  // истории браузера и журналах прокси (аудит 23.10.2026).
  it('posts to /lead even without JS', () => {
    const html = render({ open: true });
    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toMatch(/<form[^>]*action="\/lead"/);
  });

  it('shows the result of a form sent without JS', () => {
    expect(render({ open: true, result: 'sent' })).toContain('Заявка отправлена');
    const failed = render({ open: true, result: 'consent' });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('Отметьте согласие');
  });

  it('ignores an unknown result code', () => {
    const html = render({ open: true, result: '<script>' });
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('&lt;script');
  });
});
