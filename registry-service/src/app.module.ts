import { Module } from '@nestjs/common';

import { CalibrationModule } from './calibration/calibration.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { InstrumentModule } from './instrument/instrument.module';
import { TraceabilityModule } from './traceability/traceability.module';

@Module({
  imports: [ConfigModule, DatabaseModule, InstrumentModule, CalibrationModule, TraceabilityModule],
})
export class AppModule {}
