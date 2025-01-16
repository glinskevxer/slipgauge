import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { DatabaseConfig } from '../config/database.config';
import { MIGRATIONS } from './migrations';

/**
 * The one place the connection is configured.
 *
 * <p>Migrations run at start up. The laboratory has a single instance and a
 * deploy is a restart, so a separate migration step would be a second thing to
 * remember rather than a safeguard.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const database = config.getOrThrow<DatabaseConfig>('database');

        return {
          type: 'postgres' as const,
          url: database.url,
          username: database.user,
          password: database.password,
          autoLoadEntities: true,
          synchronize: database.synchronise,
          migrations: MIGRATIONS,
          migrationsRun: true,
          migrationsTransactionMode: 'each' as const,
          logging: database.logQueries ? (['query', 'error'] as const) : (['error'] as const),
          extra: {
            max: database.poolSize,
            connectionTimeoutMillis: database.connectionTimeoutMs,
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
