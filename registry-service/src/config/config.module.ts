import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { intervalPolicyConfig } from '../interval/interval-policy';
import { Clock } from './clock';
import { databaseConfig } from './database.config';
import { labConfig } from './lab.config';
import { securityConfig } from './security.config';

/**
 * Configuration and the clock, global because everything reads them and
 * threading them through every module import list buys nothing.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [labConfig, databaseConfig, securityConfig, intervalPolicyConfig],
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [Clock],
  exports: [Clock, NestConfigModule],
})
export class ConfigModule {}
