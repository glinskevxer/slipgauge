import { Instrument } from '@registry/instrument/instrument.entity';
import { Role } from '@registry/security/role';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-06-10T09:00:00Z';

describe('exporting the register and the board', () => {
  let harness: TestApp;
  let register: RegisterFixtures;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    register = new RegisterFixtures(harness.dataSource);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const http = () => harness.api(harness.tokenFor(Role.ADMIN));

  /** The rows without the byte order mark and the trailing blank. */
  function lines(body: string): string[] {
    return body.replace(/^﻿/, '').trimEnd().split('\r\n');
  }

  it('sends a file a browser saves rather than renders', async () => {
    await register.micrometer('SG-110001');

    const exported = await http().get('/api/instruments/export.csv').expect(200);

    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.headers['content-disposition']).toMatch(
      /attachment; filename="instrument-register-\d{4}-\d{2}-\d{2}\.csv"/,
    );
  });

  it('starts with the byte order mark, so excel reads it as utf-8', async () => {
    const exported = await http().get('/api/instruments/export.csv').expect(200);

    expect(exported.text.charCodeAt(0)).toBe(0xfeff);
  });

  it('writes the published header row', async () => {
    const exported = await http().get('/api/instruments/export.csv').expect(200);

    expect(lines(exported.text)[0]).toBe(
      'Asset tag,Class,Discipline,Criticality,Manufacturer,Model,Serial number,Status,' +
        'Reference standard,Location,Custodian,Acquired on',
    );
  });

  it('writes one line per instrument and counts them in a header', async () => {
    await register.micrometer('SG-110001');
    await register.multimeter('SG-110002');

    const exported = await http().get('/api/instruments/export.csv').expect(200);

    expect(lines(exported.text)).toHaveLength(3);
    expect(exported.headers['x-row-count']).toBe('2');
    expect(exported.headers['x-row-total']).toBe('2');
  });

  it('honours the same filters the search does', async () => {
    await register.micrometer('SG-110001');
    await register.multimeter('SG-110002');

    const exported = await http()
      .get('/api/instruments/export.csv')
      .query({ disciplines: 'ELECTRICAL' })
      .expect(200);

    expect(lines(exported.text)).toHaveLength(2);
    expect(exported.text).toContain('SG-110002');
    expect(exported.text).not.toContain('SG-110001');
  });

  it('quotes a field carrying a comma rather than splitting the row', async () => {
    const awkward = await register.save(
      'SG-110003',
      'MIC-EXT',
      'Tesa, Brown & Sharpe',
      '00530001',
      'mm',
      0,
      25,
      0.001,
    );

    expect(awkward.manufacturer).toBe('Tesa, Brown & Sharpe');

    const exported = await http().get('/api/instruments/export.csv').expect(200);

    expect(lines(exported.text)[1]).toContain('"Tesa, Brown & Sharpe"');
    expect(lines(exported.text)).toHaveLength(2);
  });

  it('writes headers alone for an empty register', async () => {
    const exported = await http().get('/api/instruments/export.csv').expect(200);

    expect(lines(exported.text)).toHaveLength(1);
    expect(exported.headers['x-row-count']).toBe('0');
  });

  it('exports the recall board at the horizon it was asked for', async () => {
    const due = await register.micrometer('SG-110001');
    due.intervalDays = 365;
    due.nextDueOn = '2025-06-12';
    due.lastCalibratedOn = '2024-06-12';

    const later = await register.multimeter('SG-110002');
    later.intervalDays = 365;
    later.nextDueOn = '2025-12-01';

    await harness.dataSource.getRepository(Instrument).save([due, later]);

    const soon = await http().get('/api/recalls/export.csv').expect(200);
    const far = await http().get('/api/recalls/export.csv').query({ horizonDays: 400 }).expect(200);

    expect(lines(soon.text)).toHaveLength(2);
    expect(lines(far.text)).toHaveLength(3);
    expect(soon.headers['x-row-count']).toBe('1');
  });

  it('carries the standing and the basis into the recall export', async () => {
    const due = await register.micrometer('SG-110001');
    due.intervalDays = 365;
    due.nextDueOn = '2025-06-01';
    await harness.dataSource.getRepository(Instrument).save(due);

    const exported = await http().get('/api/recalls/export.csv').expect(200);

    expect(lines(exported.text)[0]).toContain('Standing,Interval basis');
    expect(exported.text).toContain('OVERDUE');
  });

  it('needs a token like everything else', async () => {
    await harness
      .api('not-a-token')
      .get('/api/instruments/export.csv')
      .expect(401);
  });
});
