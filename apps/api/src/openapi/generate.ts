import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { buildOpenApiDocument, serializeOpenApiDocument } from './document';

/** Перегенерация apps/api/openapi.json: `pnpm openapi:generate` из корня. БД не нужна. */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const target = resolve(__dirname, '../../openapi.json');
  writeFileSync(target, serializeOpenApiDocument(buildOpenApiDocument(app)));
  await app.close();
  console.log(`OpenAPI written to ${target}`);
}

void main();
