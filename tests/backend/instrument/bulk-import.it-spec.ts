import { Instrument } from '@registry/instrument/instrument.entity';
import { Role } from '@registry/security/role';

import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-11-20T09:00:00Z';

const HEADERS =
  'classCode,manufacturer,model,serialNumber,unit,rangeLow,rangeHigh,resolution,' +
  'acquiredOn,description,locationCode,custodian,referenceStandard';

function row(overrides: Record<string, string> = {}): string {
  const cells: Record<string, string> = {
    classCode: 'MIC-EXT',
    manufacturer: 'Mitutoyo',
    model: '103-137',
    serialNumber: '81104321',
    unit: 'mm',
    rangeLow: '0',
    rangeHigh: '25',
    resolution: '0.001',
    acquiredOn: '2024-03-01',
    description: 'external micrometer',
    locationCode: 'HARLOW-DIM',
    custodian: 'R Okonjo',
    referenceStandard: 'false',
    ...overrides,
  };

  return HEADERS.split(',')
    .map((header) => cells[header] ?? '')
    .join(',');
}

function file(...rows: string[]): string {
  return `${HEADERS}\r\n${rows.join('\r\n')}\r\n`;
}

describe('importing a spreadsheet of instruments', () => {
  let harness: TestApp;
  let admin: ReturnType<TestApp['api']>;
  let bench: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    admin = harness.api(harness.tokenFor(Role.ADMIN));
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  function run(content: string, commit = false) {
    return admin.post(`/api/instruments/import?commit=${commit}`).send({ file: content });
  }

  it('offers a template with every column the importer reads', async () => {
    const template = await bench.get('/api/instruments/import/template').expect(200);

    expect(template.body.filename).toBe('instrument-import-template.csv');
    expect(template.body.content).toContain('classCode,manufacturer,model,serialNumber');
    expect(template.body.content).toContain('referenceStandard');
  });

  it('reports what it would do without writing anything', async () => {
    const report = await run(file(row())).expect(201);

    expect(report.body).toMatchObject({ dryRun: true, created: 1, duplicates: 0, rejected: 0 });
    expect(report.body.lines[0]).toMatchObject({
      line: 2,
      verdict: 'NEW',
      describes: 'Mitutoyo 103-137, s/n 81104321',
      assetTag: null,
    });

    expect(await harness.dataSource.getRepository(Instrument).count()).toBe(0);
  });

  it('writes the rows when it is committed, and hands back the tags', async () => {
    const report = await run(file(row()), true).expect(201);

    expect(report.body.dryRun).toBe(false);
    expect(report.body.lines[0].assetTag).toMatch(/^SG-\d+$/);

    const held = await harness.dataSource
      .getRepository(Instrument)
      .findOneOrFail({ where: { serialNumber: '81104321' }, relations: { location: true } });

    expect(held.manufacturer).toBe('Mitutoyo');
    expect(held.rangeHigh).toBe(25);
    expect(held.location?.code).toBe('HARLOW-DIM');
    expect(held.custodian).toBe('R Okonjo');
    expect(held.isReference).toBe(false);
  });

  it('reads the spreadsheet idea of a boolean', async () => {
    await run(file(row({ referenceStandard: 'yes' })), true).expect(201);

    const held = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ serialNumber: '81104321' });
    expect(held.isReference).toBe(true);
  });

  it('names an instrument it already holds rather than making a second one', async () => {
    await new RegisterFixtures(harness.dataSource).save(
      'SG-7001',
      'MIC-EXT',
      'Mitutoyo',
      '103-137',
      'mm',
      0,
      25,
      0.001,
    );
    await harness.dataSource
      .getRepository(Instrument)
      .update({ assetTag: 'SG-7001' }, { serialNumber: '81104321' });

    const report = await run(file(row()), true).expect(201);

    expect(report.body).toMatchObject({ created: 0, duplicates: 1 });
    expect(report.body.lines[0]).toMatchObject({
      verdict: 'DUPLICATE',
      assetTag: 'SG-7001',
    });
    expect(await harness.dataSource.getRepository(Instrument).count()).toBe(1);
  });

  it('catches the same item twice inside one file', async () => {
    const report = await run(file(row(), row())).expect(201);

    expect(report.body.lines[1].verdict).toBe('REJECTED');
    expect(report.body.lines[1].problems[0]).toContain('appears earlier in the same file');
  });

  it('reports every problem on a line rather than the first', async () => {
    const report = await run(
      file(row({ manufacturer: '', rangeLow: '30', rangeHigh: '10', acquiredOn: 'March' })),
    ).expect(201);

    expect(report.body.lines[0].verdict).toBe('REJECTED');
    expect(report.body.lines[0].problems).toEqual(
      expect.arrayContaining([
        'manufacturer is empty',
        'rangeLow has to sit below rangeHigh',
        'acquiredOn has to be written as yyyy-mm-dd',
      ]),
    );
  });

  it('rejects a class or a location it has never heard of', async () => {
    const report = await run(
      file(row({ classCode: 'NOPE' }), row({ serialNumber: 'S2', locationCode: 'NOWHERE' })),
    ).expect(201);

    expect(report.body.lines[0].problems).toContain('there is no class called NOPE');
    expect(report.body.lines[1].problems).toContain('there is no location called NOWHERE');
  });

  it('rejects an acquisition date in the future', async () => {
    const report = await run(file(row({ acquiredOn: '2026-06-01' }))).expect(201);

    expect(report.body.lines[0].problems).toContain('acquiredOn is in the future');
  });

  it('brings the good rows in and leaves the bad ones out', async () => {
    const report = await run(
      file(
        row({ serialNumber: 'S1' }),
        row({ serialNumber: 'S2', resolution: '0' }),
        row({ serialNumber: 'S3' }),
      ),
      true,
    ).expect(201);

    expect(report.body).toMatchObject({ created: 2, rejected: 1 });
    expect(await harness.dataSource.getRepository(Instrument).count()).toBe(2);
  });

  it('refuses a file that is missing a column the importer needs', async () => {
    const refused = await run('manufacturer,model\r\nMitutoyo,103-137\r\n').expect(400);

    expect(refused.body.detail).toContain('missing classCode');
  });

  it('refuses a file whose rows do not match its headers', async () => {
    const refused = await run(`${HEADERS}\r\nMitutoyo,103-137\r\n`).expect(400);

    expect(refused.body.detail).toContain('line 2');
  });

  it('reads a file that has only the columns it needs', async () => {
    const headers =
      'classCode,manufacturer,model,serialNumber,unit,rangeLow,rangeHigh,resolution,acquiredOn';
    const bare = `${headers}\r\nMIC-EXT,Mitutoyo,103-137,81104321,mm,0,25,0.001,2024-03-01\r\n`;

    const report = await run(bare, true).expect(201);
    expect(report.body.created).toBe(1);
  });

  it('takes an empty file as nothing to do rather than an error', async () => {
    const report = await run(`${HEADERS}\r\n`).expect(201);

    expect(report.body).toMatchObject({ created: 0, duplicates: 0, rejected: 0 });
  });

  it('will not let the bench import anything', async () => {
    await bench
      .post('/api/instruments/import?commit=true')
      .send({ file: file(row()) })
      .expect(403);
  });
});
