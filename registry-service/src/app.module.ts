import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { InstrumentModule } from './instrument/instrument.module';

@Module({
  imports: [ConfigModule, DatabaseModule, InstrumentModule],
})
export class AppModule {}
