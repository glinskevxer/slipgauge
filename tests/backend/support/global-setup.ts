import { startTestDatabase, testDatabaseUrl } from './embedded-database';

/**
 * Runs once before the integration suites. Everything the service reads from
 * the environment is set here, so no suite has to remember to do it and none
 * of them can disagree about the signing key.
 */
export default async function globalSetup(): Promise<void> {
  await startTestDatabase();

  process.env['REGISTRY_DB_URL'] = testDatabaseUrl();
  process.env['REGISTRY_DB_USER'] = 'postgres';
  process.env['REGISTRY_DB_PASSWORD'] = 'postgres';
  process.env['REGISTRY_JWT_SECRET'] = 'integration-test-signing-key-not-used-outside-the-suite';
  process.env['REGISTRY_BCRYPT_ROUNDS'] = '4';
  process.env['LAB_NAME'] = 'Slipgauge Metrology';
  process.env['LAB_ACCREDITATION_REF'] = 'TEST-0001';
}
