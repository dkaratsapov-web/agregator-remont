import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { buildOpenApiDocument, serializeOpenApiDocument } from './document';

describe('OpenAPI', () => {
  it('apps/api/openapi.json matches the code (run `pnpm openapi:generate` after API changes)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    const generated = serializeOpenApiDocument(buildOpenApiDocument(app));
    await app.close();
    const committed = readFileSync(resolve(__dirname, '../../openapi.json'), 'utf8');
    expect(generated).toBe(committed);
  });

  it('is deterministic', async () => {
    const build = async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const app = moduleRef.createNestApplication({ logger: false });
      const json = serializeOpenApiDocument(buildOpenApiDocument(app));
      await app.close();
      return json;
    };
    expect(await build()).toBe(await build());
  });
});
