import type { OpenAPIObject } from '@nestjs/swagger';

import { buildOpenApiDocument } from '@registry/config/openapi';
import type { LabConfig } from '@registry/config/lab.config';
import { TestApp, createTestApp } from '../support/test-app';

const LAB: LabConfig = {
  name: 'Slipgauge Metrology',
  accreditationRef: 'UKAS 0001',
  timeZone: 'Europe/London',
  assetTagPrefix: 'SG',
  assetTagWidth: 6,
  version: '1.4.0',
  website: 'https://slipgauge.internal',
  contactEmail: 'quality@slipgauge.internal',
};

/**
 * The document is built against the real module graph, because the point of
 * the test is that every route the service exposes is in it. A stub module
 * would only prove the builder works.
 */
describe('the published api document', () => {
  let harness: TestApp;
  let document: OpenAPIObject;

  beforeAll(async () => {
    harness = await createTestApp();
    document = buildOpenApiDocument(harness.app, LAB);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('names the laboratory and the version it was built at', () => {
    expect(document.info.title).toContain('Slipgauge Metrology');
    expect(document.info.version).toBe('1.4.0');
    expect(document.info.contact?.email).toBe('quality@slipgauge.internal');
  });

  it('says the two things a reader has to know before the rest', () => {
    expect(document.info.description).toContain('never accepted from a caller');
    expect(document.info.description).toContain('withdrawing it and filing a replacement');
  });

  it('declares the bearer scheme the console uses', () => {
    expect(document.components?.securitySchemes?.['registry-token']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it('carries every part of the register as a tag', () => {
    const tags = (document.tags ?? []).map((tag) => tag.name);

    expect(tags).toEqual(
      expect.arrayContaining([
        'instruments',
        'certificates',
        'recalls',
        'usage',
        'impact',
        'accounts',
      ]),
    );
  });

  it('publishes the routes the console is built against', () => {
    const paths = Object.keys(document.paths);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/instruments',
        '/api/instruments/{id}',
        '/api/certificates',
        '/api/recalls',
        '/api/recalls/summary',
        '/api/usage',
        '/api/impact',
        '/api/accounts',
        '/api/auth/sign-in',
      ]),
    );
  });

  it('leaves health and metrics outside the api prefix', () => {
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(['/health', '/metrics']));
  });

  it('tags every operation, so nothing lands in the default bucket', () => {
    const untagged: string[] = [];

    for (const [path, item] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        const tags = (operation as { tags?: string[] }).tags ?? [];

        if (tags.length === 0 && !path.startsWith('/health') && path !== '/metrics') {
          untagged.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    expect(untagged).toEqual([]);
  });

  it('marks the register as needing the bearer token', () => {
    const register = document.paths['/api/instruments']?.get;

    expect(register?.security).toEqual([{ 'registry-token': [] }]);
  });

  it('describes the path parameters a caller has to fill in', () => {
    const one = document.paths['/api/instruments/{id}']?.get;
    const names = (one?.parameters ?? []).map((parameter) => (parameter as { name: string }).name);

    expect(names).toContain('id');
  });
});
