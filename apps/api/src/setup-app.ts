import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

/** Общая настройка для main.ts и e2e-тестов, чтобы тесты проверяли то же поведение. */
export function setupApp(app: INestApplication, corsOrigins: string[]): void {
  app.use(helmet());
  app.enableCors({ origin: corsOrigins, methods: ['GET', 'HEAD', 'OPTIONS'] });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
}
