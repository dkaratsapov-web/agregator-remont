import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // В тестах server-only не нужен: модули проверяются вне React Server Components.
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // `pnpm test:cov`: покрытие модулей с логикой (lib, actions, маршруты). Компоненты React
    // проверяют браузерные сценарии (scripts/*-e2e.mjs), поэтому .tsx в отчёт не входят.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'text', 'lcov'],
      reportsDirectory: 'coverage',
      // Нижняя граница по замеру (TEST_COVERAGE.md): покрытие не должно падать незаметно.
      thresholds: { statements: 67, branches: 68, functions: 70, lines: 69 },
    },
  },
});
