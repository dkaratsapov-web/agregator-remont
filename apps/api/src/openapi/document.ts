import { CLOSED_API_ENUMS, OPEN_API_ENUMS, OPEN_INLINE_API_ENUMS } from '@agregator/shared';
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
    .setDescription(
      'Публичный контракт API маркетплейса. Ошибки — с машинным code (ADR 0002). ' +
        'Перечни помечены x-enum-kind: open — может пополняться, closed — нет (ADR 0001).',
    )
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
  return normalize(markEnums(closeObjects(document) as OpenAPIObject)) as OpenAPIObject;
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

type EnumSchema = { enum?: unknown[]; properties?: Record<string, EnumSchema> } & Record<
  string,
  unknown
>;

/**
 * Пометка перечней (ADR 0001, раздел 2): `x-enum-kind: open | closed`, у открытых ещё
 * `x-extensible-enum`. Именованный enum без решения в packages/shared/src/api-enums.ts —
 * ошибка сборки: новый перечень нельзя выпустить, не решив, открытый он или закрытый.
 */
export function markEnums(document: OpenAPIObject): OpenAPIObject {
  const open = new Set<string>(OPEN_API_ENUMS);
  const closed = new Set<string>(CLOSED_API_ENUMS);
  const openInline = new Set<string>(OPEN_INLINE_API_ENUMS);
  const mark = (schema: EnumSchema, isOpen: boolean) => {
    schema['x-enum-kind'] = isOpen ? 'open' : 'closed';
    if (isOpen) schema['x-extensible-enum'] = schema.enum;
  };
  const unknown: string[] = [];
  for (const [name, schema] of Object.entries(document.components?.schemas ?? {}) as [
    string,
    EnumSchema,
  ][]) {
    if (Array.isArray(schema.enum)) {
      if (open.has(name)) mark(schema, true);
      else if (closed.has(name)) mark(schema, false);
      else unknown.push(name);
    }
    for (const [field, property] of Object.entries(schema.properties ?? {})) {
      if (Array.isArray(property.enum)) mark(property, openInline.has(`${name}.${field}`));
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `Перечни без решения «открытый/закрытый» (packages/shared/src/api-enums.ts): ${unknown.join(', ')}`,
    );
  }
  return document;
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
