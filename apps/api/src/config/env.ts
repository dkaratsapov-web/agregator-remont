export interface AppEnv {
  port: number;
  corsOrigins: string[];
  databaseUrl: string;
}

/** Читает и проверяет переменные окружения; при ошибке приложение не стартует. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const databaseUrl = source.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const port = Number(source.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`API_PORT must be an integer 1..65535, got "${source.API_PORT}"`);
  }

  const corsOrigins = (source.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGINS must list explicit origins, "*" is not allowed');
  }

  return { port, corsOrigins, databaseUrl };
}
