import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { BEARER_AUTH } from './decorators';

/** Версия контракта `/v1` (ADR 0001). Меняется вместе с совместимыми изменениями схемы. */
export const API_CONTRACT_VERSION = '1.0.0';

/**
 * Спецификация OpenAPI из кода контроллеров и схем. Детерминирована: ключи отсортированы,
 * нет дат и адресов окружения. Swagger UI не подключается (ADR 0001).
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Agregator Remont API')
    .setDescription('Публичный контракт API маркетплейса. Ошибки — в текущем формате NestJS.')
    .setVersion(API_CONTRACT_VERSION)
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', description: 'Токен сессии из /v1/auth/login' },
      BEARER_AUTH,
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
  return normalize(closeObjects(document)) as OpenAPIObject;
}

/** Схемы объектов не допускают лишних полей: ответы проверяются строго, запросы — так же, как ValidationPipe. */
function closeObjects(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(closeObjects);
  if (node === null || typeof node !== 'object') return node;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) result[key] = closeObjects(value);
  if ('properties' in result && !('additionalProperties' in result)) {
    result.additionalProperties = false;
  }
  return result;
}

/** Стабильный порядок ключей объектов; порядок массивов сохраняется. */
function normalize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalize);
  if (node === null || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.keys(node)
      .sort()
      .map((key) => [key, normalize((node as Record<string, unknown>)[key])]),
  );
}

export function serializeOpenApiDocument(document: OpenAPIObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
