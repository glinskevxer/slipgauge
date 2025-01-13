import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  readonly url: string;
  readonly user: string;
  readonly password: string;
  readonly poolSize: number;
  readonly connectionTimeoutMs: number;
  /** Never true outside a test. The schema is owned by the migrations. */
  readonly synchronise: boolean;
  readonly logQueries: boolean;
}

export const databaseConfig = registerAs('database', (): DatabaseConfig => ({
  url: process.env['REGISTRY_DB_URL'] ?? 'postgres://localhost:5432/slipgauge',
  user: process.env['REGISTRY_DB_USER'] ?? 'slipgauge',
  password: process.env['REGISTRY_DB_PASSWORD'] ?? 'slipgauge',
  poolSize: Number(process.env['REGISTRY_DB_POOL_SIZE'] ?? 12),
  connectionTimeoutMs: Number(process.env['REGISTRY_DB_TIMEOUT_MS'] ?? 5000),
  synchronise: false,
  logQueries: process.env['REGISTRY_DB_LOG_QUERIES'] === 'true',
}));
