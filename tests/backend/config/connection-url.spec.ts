import { parseDatabaseUrl } from '@registry/config/connection-url';

describe('the database url', () => {
  it('splits host, port and database out of a plain url', () => {
    expect(parseDatabaseUrl('postgres://db.lab.internal:6543/slipgauge')).toEqual({
      host: 'db.lab.internal',
      port: 6543,
      database: 'slipgauge',
    });
  });

  it('accepts the postgresql spelling as well', () => {
    expect(parseDatabaseUrl('postgresql://localhost/slipgauge').database).toBe('slipgauge');
  });

  it('falls back to the standard port when the url leaves it out', () => {
    expect(parseDatabaseUrl('postgres://localhost/slipgauge').port).toBe(5432);
  });

  it('reports credentials only when the url actually carried them', () => {
    const bare = parseDatabaseUrl('postgres://localhost/slipgauge');

    expect(bare.user).toBeUndefined();
    expect(bare.password).toBeUndefined();

    const withLogin = parseDatabaseUrl('postgres://reader:hunter2@localhost/slipgauge');

    expect(withLogin.user).toBe('reader');
    expect(withLogin.password).toBe('hunter2');
  });

  it('decodes an escaped password, which is how an awkward one gets in', () => {
    const parsed = parseDatabaseUrl('postgres://reader:p%40ss%2Fword@localhost/slipgauge');

    expect(parsed.password).toBe('p@ss/word');
  });

  it('decodes a database name that had to be escaped', () => {
    expect(parseDatabaseUrl('postgres://localhost/slipgauge%20uat').database).toBe('slipgauge uat');
  });

  it('rejects a scheme that is not postgres', () => {
    expect(() => parseDatabaseUrl('mysql://localhost/slipgauge')).toThrow(
      'must be a postgres:// or postgresql:// URL',
    );
  });

  it('rejects something that is not a url at all', () => {
    expect(() => parseDatabaseUrl('')).toThrow('is not a URL');
    expect(() => parseDatabaseUrl('the one on the bench')).toThrow('is not a URL');
  });

  it('treats a bare host and port as the wrong scheme, not as a host', () => {
    // Node reads localhost:5432 as the scheme "localhost", which is worth
    // pinning: the error the operator gets has to point at the missing
    // postgres:// rather than at a port.
    expect(() => parseDatabaseUrl('localhost:5432')).toThrow('must be a postgres://');
  });

  it('rejects a url that names no database', () => {
    expect(() => parseDatabaseUrl('postgres://localhost:5432')).toThrow('names no database');
    expect(() => parseDatabaseUrl('postgres://localhost:5432/')).toThrow('names no database');
  });

  it('rejects a path below the database name, which is always a mistake', () => {
    expect(() => parseDatabaseUrl('postgres://localhost/slipgauge/public')).toThrow(
      'path below the database name',
    );
  });

  it('rejects a port outside the range a socket can use', () => {
    expect(() => parseDatabaseUrl('postgres://localhost:99999/slipgauge')).toThrow();
  });
});
