import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { Response } from 'supertest';

/**
 * Проверка реальных ответов по apps/api/openapi.json (ADR 0003, «wire»). Схемы OpenAPI 3.0
 * переводятся в JSON Schema: `nullable: true` → `anyOf: [схема, null]`. Строгость задаёт сама
 * спецификация: все поля ответов required, `additionalProperties: false`.
 */
type Json = Record<string, unknown>;
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

const spec = JSON.parse(readFileSync(resolve(__dirname, '../openapi.json'), 'utf8')) as {
  paths: Record<string, Record<string, { responses: Record<string, Json> }>>;
  components: { schemas: Record<string, unknown> };
};

function toJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toJsonSchema);
  if (node === null || typeof node !== 'object') return node;
  const result: Json = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'nullable') continue;
    if (key === '$ref' && typeof value === 'string') {
      result.$ref = value.replace('#/components/schemas/', 'openapi#/components/schemas/');
      continue;
    }
    result[key] = toJsonSchema(value);
  }
  return (node as Json).nullable === true ? { anyOf: [result, { type: 'null' }] } : result;
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema({ $id: 'openapi', components: toJsonSchema(spec.components) as Json });

const validators = new Map<string, ValidateFunction>();
const covered = new Set<string>();

const key = (method: Method, path: string, status: number | string) =>
  `${method.toUpperCase()} ${path} ${status}`;

/** Ответ объявлен в спецификации для этого маршрута и статуса, и тело ей соответствует. */
export function expectContract(res: Response, method: Method, path: string): void {
  const operation = spec.paths[path]?.[method];
  if (!operation) throw new Error(`${method.toUpperCase()} ${path} is not in openapi.json`);
  const id = key(method, path, res.status);
  const response = operation.responses[String(res.status)] as
    { content?: { 'application/json'?: { schema: unknown } } } | undefined;
  if (!response) {
    throw new Error(`${id}: status is not declared in openapi.json; body: ${res.text}`);
  }
  const schema = response.content?.['application/json']?.schema;
  if (schema === undefined) {
    if (res.text !== '') throw new Error(`${id}: expected an empty body, got ${res.text}`);
  } else {
    let validate = validators.get(id);
    if (!validate) {
      validate = ajv.compile(toJsonSchema(schema) as Json);
      validators.set(id, validate);
    }
    if (!validate(res.body)) {
      throw new Error(
        `${id}: body does not match openapi.json\n${ajv.errorsText(validate.errors)}\n${res.text}`,
      );
    }
  }
  covered.add(id);
}

/**
 * Пары «операция + статус» из спецификации, которые не проверены ни одним ответом.
 * 429 объявлен у всех маршрутов /v1 (общий лимит), но проверяется на представителях каждого
 * механизма: лимиты default, auth, write и суточные квоты — см. contract.e2e-spec.ts.
 */
export function uncoveredResponses(required429: string[]): string[] {
  const missing: string[] = [];
  for (const [path, operations] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      for (const status of Object.keys(operation.responses)) {
        const id = key(method as Method, path, status);
        if (status === '429' && !required429.includes(id)) continue;
        if (!covered.has(id)) missing.push(id);
      }
    }
  }
  return missing;
}
