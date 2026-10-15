import { resolveTestDatabaseUrl } from './test-db';

process.env.DATABASE_URL = resolveTestDatabaseUrl();
