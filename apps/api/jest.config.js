/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '(src|test)/.*\\.(spec|e2e-spec)\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  // `pnpm test:cov`: все файлы src/, включая те, что ни один тест не загрузил (иначе они
  // выпадают из отчёта и завышают процент).
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageReporters: ['text-summary', 'text', 'lcov'],
  // Нижняя граница по замеру (TEST_COVERAGE.md): покрытие не должно падать незаметно.
  coverageThreshold: { global: { statements: 95, branches: 85, functions: 96, lines: 96 } },
};
