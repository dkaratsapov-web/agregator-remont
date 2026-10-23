import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Сайт не обещает того, чего в продукте нет (аудит 23.10.2026, F-01; Issue #58): безопасной
 * сделки, удержания денег, арбитража и финансовых гарантий в коде нет — о них только как о
 * разработке. Тест ищет такие обещания во всех текстах сайта.
 */
const FORBIDDEN = [
  /гарантом качества/i,
  /без потери ваших денег/i,
  /деньги (?:за этап )?хранятся/i,
  /деньги будут ждать/i,
  /гарантируем (?:качество|возврат|сохранность)/i,
  /вернём деньги/i,
  /решаем споры/i,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('site copy promises only what works', () => {
  const root = join(__dirname, '..', '..');
  it.each(files(root))('%s', (path) => {
    const text = readFileSync(path, 'utf8');
    for (const pattern of FORBIDDEN) expect(text).not.toMatch(pattern);
  });

  it('payments are named as work in progress on the landing', () => {
    const story = readFileSync(join(__dirname, 'story.tsx'), 'utf8');
    expect(story).toContain('Оплата через сервис — в разработке');
    expect(story).toContain('Безопасная сделка и помощь в спорах — в разработке');
  });
});
