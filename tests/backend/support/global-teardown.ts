import { stopTestDatabase } from './embedded-database';

export default async function globalTeardown(): Promise<void> {
  await stopTestDatabase();
}
