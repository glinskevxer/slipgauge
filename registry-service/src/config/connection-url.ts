/**
 * The database URL is split here rather than handed to the driver whole.
 *
 * <p>A URL with no credentials in it does not mean "use the ones configured
 * elsewhere", it means "use the operating system account", and the driver will
 * quietly do that. Splitting the URL keeps the deployment able to hold the
 * password somewhere other than the connection string, which is what every
 * secret store we deploy against wants, without the host and the port having
 * to be configured twice.
 */
export interface ConnectionTarget {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  /** Present only when the URL itself carried one. */
  readonly user?: string;
  readonly password?: string;
}

const DEFAULT_PORT = 5432;
const SCHEMES = new Set(['postgres:', 'postgresql:']);

export function parseDatabaseUrl(url: string): ConnectionTarget {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`REGISTRY_DB_URL is not a URL: ${url}`);
  }

  if (!SCHEMES.has(parsed.protocol)) {
    throw new Error(
      `REGISTRY_DB_URL must be a postgres:// or postgresql:// URL, got ${parsed.protocol}//`,
    );
  }

  const database = parsed.pathname.replace(/^\//, '');
  if (database.length === 0) {
    throw new Error(`REGISTRY_DB_URL names no database: ${url}`);
  }
  if (database.includes('/')) {
    throw new Error(`REGISTRY_DB_URL has a path below the database name: ${url}`);
  }

  const host = parsed.hostname.length > 0 ? decodeURIComponent(parsed.hostname) : 'localhost';
  const port = parsed.port.length > 0 ? Number(parsed.port) : DEFAULT_PORT;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`REGISTRY_DB_URL has an unusable port: ${parsed.port}`);
  }

  return {
    host,
    port,
    database: decodeURIComponent(database),
    ...(parsed.username.length > 0 ? { user: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password.length > 0 ? { password: decodeURIComponent(parsed.password) } : {}),
  };
}
