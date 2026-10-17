import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { TrustProxy } from '../src/config/env';
import { LEADS_ENABLED } from '../src/leads/leads.config';
import { setupApp } from '../src/setup-app';

/**
 * Приложение с той же настройкой, что и в main.ts. Лимиты читаются из process.env.
 * leadsEnabled включает приём заявок, который в коде выключен до появления реквизитов оператора.
 */
export async function createTestApp(
  trustProxy: TrustProxy = false,
  options: { leadsEnabled?: boolean } = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LEADS_ENABLED)
    .useValue(options.leadsEnabled ?? false)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app, { corsOrigins: ['http://localhost:3000'], trustProxy });
  await app.init();
  return app;
}
