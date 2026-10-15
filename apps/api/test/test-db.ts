/** Тесты работают только с отдельной БД, чье имя оканчивается на _test, чтобы не стереть данные разработки. */
export function resolveTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is required for API tests (see .env.example)');
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests against "${dbName}": database name must end with _test`);
  }
  return url;
}
