import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * One PostgreSQL server for the whole integration run.
 *
 * <p>The binaries come from the embedded-postgres package, which ships a real
 * server per platform, but they are driven here directly rather than through
 * its wrapper: the wrapper is ESM only and these tests run under CommonJS.
 * Three commands is not much to own, and it means the integration tests need
 * nothing on the machine but Node.
 *
 * <p>Only initdb, pg_ctl and postgres ship, so there is no createdb and no
 * psql. The database is made in single user mode before the server comes up,
 * which avoids pulling a client library into the setup file. Setup runs
 * outside the Jest module registry, so anything it imports has to resolve from
 * the repository root rather than from registry-service.
 */
const PORT = Number(process.env['REGISTRY_TEST_DB_PORT'] ?? 55433);
const DATABASE = 'registry_test';

export const TEST_DB_USER = 'postgres';
export const TEST_DB_PASSWORD = 'postgres';

let directory: string | undefined;

export function testDatabaseUrl(): string {
  return `postgres://127.0.0.1:${PORT}/${DATABASE}`;
}

/**
 * The platform package embedded-postgres installed for this machine. Found by
 * looking rather than named, so a checkout on another platform works without
 * anybody editing this.
 */
function binDirectory(): string {
  const packages = join(__dirname, '..', '..', '..', 'registry-service', 'node_modules', '@embedded-postgres');

  if (!existsSync(packages)) {
    throw new Error(
      'embedded-postgres is not installed. Run npm ci in registry-service before the ' +
        'integration tests.',
    );
  }

  for (const entry of readdirSync(packages)) {
    const candidate = join(packages, entry, 'native', 'bin');
    if (existsSync(join(candidate, 'pg_ctl'))) {
      return candidate;
    }
  }
  throw new Error(`no PostgreSQL binaries under ${packages} for this platform`);
}

function run(command: string, args: string[], input?: string): void {
  execFileSync(join(binDirectory(), command), args, { stdio: 'pipe', input });
}

export async function startTestDatabase(): Promise<void> {
  if (directory) {
    return;
  }
  directory = mkdtempSync(join(tmpdir(), 'slipgauge-pg-'));

  const passwordFile = join(directory, '.pgpass');
  writeFileSync(passwordFile, TEST_DB_PASSWORD, { mode: 0o600 });

  const data = join(directory, 'data');
  run('initdb', ['-D', data, '-U', TEST_DB_USER, `--pwfile=${passwordFile}`, '-A', 'md5']);

  // Single user mode talks to the data directory with no server and no client
  // library. It reads one statement per line from stdin.
  run('postgres', ['--single', '-D', data, 'postgres'], `create database ${DATABASE};\n`);

  // Durability buys nothing for a database that is deleted at the end, and it
  // is most of the wall clock time of a suite that truncates between tests.
  run('pg_ctl', [
    '-D',
    data,
    '-l',
    join(directory, 'server.log'),
    '-o',
    `-p ${PORT} -c fsync=off -c full_page_writes=off -c synchronous_commit=off ` +
      `-c listen_addresses=127.0.0.1`,
    '-w',
    'start',
  ]);
}

export async function stopTestDatabase(): Promise<void> {
  if (!directory) {
    return;
  }
  try {
    run('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']);
  } catch {
    // Already gone. The data directory is a temp folder either way.
  }
  rmSync(directory, { recursive: true, force: true });
  directory = undefined;
}
