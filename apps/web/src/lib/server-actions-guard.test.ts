import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Каждое Server Action проверяет, что запрос пришёл с этого сайта (`isTrustedOrigin`), сама или
 * через функцию того же файла (`prepare`, обёртка формы над основным действием). Без этой
 * проверки чужая страница могла бы отправить действие от имени вошедшего человека (CSRF).
 * Аудит 23.10.2026, матрица безопасности: новое действие без проверки ломает этот тест.
 */

const SRC = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

const serverFiles = files(SRC).filter((path) =>
  /^\s*['"]use server['"];?/.test(readFileSync(path, 'utf8')),
);

/** Функции верхнего уровня файла: имя, экспортирована ли, тело до следующей функции. */
function functions(source: string) {
  const re = /^(export\s+)?async\s+function\s+(\w+)/gm;
  const found = [...source.matchAll(re)];
  return found.map((match, i) => ({
    name: match[2],
    exported: Boolean(match[1]),
    body: source.slice(match.index, found[i + 1]?.index ?? source.length),
  }));
}

function unguardedExports(source: string): string[] {
  const list = functions(source);
  const guarded = new Set<string>();
  // Повторяем, пока множество растёт: обёртка защищена, если вызывает защищённую функцию.
  for (let changed = true; changed;) {
    changed = false;
    for (const fn of list) {
      if (guarded.has(fn.name)) continue;
      const calls = (name: string) => new RegExp(`\\b${name}\\(`).test(fn.body);
      if (calls('isTrustedOrigin') || [...guarded].some(calls)) {
        guarded.add(fn.name);
        changed = true;
      }
    }
  }
  return list.filter((fn) => fn.exported && !guarded.has(fn.name)).map((fn) => fn.name);
}

describe('Server Actions check the request origin', () => {
  it('finds the action files (sanity)', () => {
    expect(serverFiles.length).toBeGreaterThanOrEqual(14);
  });

  it.each(serverFiles.map((path) => [relative(SRC, path), path]))('%s', (_name, path) => {
    const source = readFileSync(path, 'utf8');
    expect(functions(source).some((fn) => fn.exported)).toBe(true);
    expect(unguardedExports(source)).toEqual([]);
  });

  it('the checker catches an action without the check', () => {
    const source = `'use server';
export async function good() { if (!(await isTrustedOrigin())) return; }
export async function wrapper() { return good(); }
export async function bad() { return 1; }`;
    expect(unguardedExports(source)).toEqual(['bad']);
  });
});
