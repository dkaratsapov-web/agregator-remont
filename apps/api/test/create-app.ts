import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { TrustProxy } from '../src/config/env';
import { LEADS_ENABLED } from '../src/leads/leads.config';
import { OAUTH_CONFIG, type OAuthConfig } from '../src/oauth/oauth.config';
import { setupApp } from '../src/setup-app';

/**
 * Приложение с той же настройкой, что и в main.ts. Лимиты читаются из process.env.
 * leadsEnabled включает приём заявок, который в коде выключен до появления реквизитов оператора.
 * oauth — настройка входа через банки (в тестах — поддельный банк); по умолчанию банков нет.
 */
export async function createTestApp(
  trustProxy: TrustProxy = false,
  options: { leadsEnabled?: boolean; oauth?: OAuthConfig } = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LEADS_ENABLED)
    .useValue(options.leadsEnabled ?? false)
    .overrideProvider(OAUTH_CONFIG)
    .useValue(options.oauth ?? { providers: [] })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app, { corsOrigins: ['http://localhost:3000'], trustProxy });
  await app.init();
  return app;
}
