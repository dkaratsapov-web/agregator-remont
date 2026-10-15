import { execSync } from 'node:child_process';
import { resolveTestDatabaseUrl } from './test-db';

export default function globalSetup(): void {
  const url = resolveTestDatabaseUrl();
  execSync('prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
