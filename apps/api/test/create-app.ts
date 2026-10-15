import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

/** Приложение с той же настройкой, что и в main.ts. Лимиты читаются из process.env. */
export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app, { corsOrigins: ['http://localhost:3000'], trustProxy: false });
  await app.init();
  return app;
}
