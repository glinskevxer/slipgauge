import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalibrationModule } from '../calibration/calibration.module';
import { Instrument } from '../instrument/instrument.entity';
import { InstrumentModule } from '../instrument/instrument.module';
import { AppUser } from '../security/app-user.entity';
import { UsageRecord } from '../usage/usage-record.entity';
import { DemoEstateBootstrap } from './demo-estate.bootstrap';
import { DemoEstateService } from './demo-estate.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Instrument, UsageRecord, AppUser]),
    InstrumentModule,
    CalibrationModule,
  ],
  providers: [DemoEstateService, DemoEstateBootstrap],
  exports: [DemoEstateService],
})
export class DemoModule {}
