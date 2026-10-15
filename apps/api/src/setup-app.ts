import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppEnv } from './config/env';

/** Общая настройка для main.ts и e2e-тестов, чтобы тесты проверяли то же поведение. */
export function setupApp(
  app: NestExpressApplication,
  env: Pick<AppEnv, 'corsOrigins' | 'trustProxy'>,
): void {
  // От этого зависят req.ip и ключи rate limit; см. docs/DEPLOYMENT.md.
  app.set('trust proxy', env.trustProxy);
  app.use(helmet());
  app.enableCors({ origin: env.corsOrigins, methods: ['GET', 'HEAD', 'OPTIONS'] });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
}
