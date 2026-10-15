import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { setupApp } from './setup-app';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  setupApp(app, env.corsOrigins);
  await app.listen(env.port);
  Logger.log(`API listening on http://localhost:${env.port}`, 'Bootstrap');
}

void bootstrap();
