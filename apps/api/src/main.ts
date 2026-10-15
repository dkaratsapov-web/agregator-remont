import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { setupApp } from './setup-app';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  setupApp(app, env);
  await app.listen(env.port);
  Logger.log(`API listening on http://localhost:${env.port}`, 'Bootstrap');
}

void bootstrap();
