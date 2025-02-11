import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';

/**
 * One PostgreSQL server for the whole integration run.
 *
 * <p>Unpacked by the package rather than started as a container, because this
 * repository has to be testable on a machine with nothing but Node on it.
 * Starting a server costs a few seconds and every test wants the same schema,
 * so the instance is shared and each suite cleans up after itself instead.
 */
const PORT = Number(process.env['REGISTRY_TEST_DB_PORT'] ?? 55433);

let server: EmbeddedPostgres | undefined;
let directory: string | undefined;

export function testDatabaseUrl(): string {
  return `postgres://127.0.0.1:${PORT}/registry_test`;
}

export const TEST_DB_USER = 'postgres';
export const TEST_DB_PASSWORD = 'postgres';

export async function startTestDatabase(): Promise<void> {
  if (server) {
    return;
  }
  directory = mkdtempSync(join(tmpdir(), 'slipgauge-pg-'));

  server = new EmbeddedPostgres({
    databaseDir: directory,
    user: TEST_DB_USER,
    password: TEST_DB_PASSWORD,
    port: PORT,
    persistent: false,
    // Durability buys nothing for a database that is deleted at the end.
    postgresFlags: ['-c', 'fsync=off', '-c', 'full_page_writes=off', '-c', 'synchronous_commit=off'],
  });

  await server.initialise();
  await server.start();
  await server.createDatabase('registry_test');
}

export async function stopTestDatabase(): Promise<void> {
  if (server) {
    await server.stop();
    server = undefined;
  }
  if (directory) {
    rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  }
}
