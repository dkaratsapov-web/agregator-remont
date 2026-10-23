import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ограждение (docs/NO_JS_FORMS.md): связанное через bind Server Action в форме без JS бесконечно
 * подвешивает рендер ответа и загружает процессор. Параметры действий — скрытым полем args
 * (components/ui/form-args.tsx), а не `action.bind(...)`.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('server actions are never bound', () => {
  it('no .bind( on actions in app and components', () => {
    const root = join(__dirname, '..');
    const offenders = files(root)
      .filter((path) => /\.bind\(\s*null/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path));
    expect(offenders).toEqual([]);
  });
});
