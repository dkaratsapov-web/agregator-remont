import { CLOSED_API_ENUMS, OPEN_API_ENUMS } from '@agregator/shared';
import type { OpenAPIObject } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { markEnums } from './document';

const doc = (schemas: Record<string, unknown>) =>
  ({
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: { schemas },
  }) as OpenAPIObject;

describe('enum marking (ADR 0001, section 2)', () => {
  it('marks open enums as extensible and closed ones as closed', () => {
    const marked = markEnums(
      doc({
        JobCategory: { type: 'string', enum: ['PLUMBING'] },
        JobStatus: { type: 'string', enum: ['OPEN'] },
        OAuthProviderDto: { properties: { id: { type: 'string', enum: ['sber'] } } },
        Health: { properties: { status: { type: 'string', enum: ['ok'] } } },
      }),
    ).components!.schemas as Record<string, Record<string, unknown>>;
    expect(marked.JobCategory).toMatchObject({
      'x-enum-kind': 'open',
      'x-extensible-enum': ['PLUMBING'],
    });
    expect(marked.JobStatus['x-enum-kind']).toBe('closed');
    expect(marked.JobStatus).not.toHaveProperty('x-extensible-enum');
    const inline = (name: string, field: string) =>
      (marked[name].properties as Record<string, Record<string, unknown>>)[field];
    expect(inline('OAuthProviderDto', 'id')['x-enum-kind']).toBe('open');
    expect(inline('Health', 'status')['x-enum-kind']).toBe('closed');
  });

  it('refuses a new named enum nobody classified', () => {
    expect(() => markEnums(doc({ DealStatus: { type: 'string', enum: ['HELD'] } }))).toThrow(
      'DealStatus',
    );
  });

  it('every enum in the committed openapi.json is classified, and no enum is both', () => {
    const spec = JSON.parse(readFileSync(join(__dirname, '../../openapi.json'), 'utf8')) as {
      components: { schemas: Record<string, { enum?: unknown[]; 'x-enum-kind'?: string }> };
    };
    const named = Object.entries(spec.components.schemas).filter(([, s]) => s.enum);
    expect(named.length).toBeGreaterThan(0);
    for (const [, schema] of named) expect(['open', 'closed']).toContain(schema['x-enum-kind']);
    const both = OPEN_API_ENUMS.filter((name) =>
      (CLOSED_API_ENUMS as readonly string[]).includes(name),
    );
    expect(both).toEqual([]);
  });
});
