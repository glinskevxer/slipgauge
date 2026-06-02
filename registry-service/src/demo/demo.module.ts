import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalibrationModule } from '../calibration/calibration.module';
import { Competence } from '../competence/competence.entity';
import { CompetenceModule } from '../competence/competence.module';
import { EnvironmentLimitRecord, EnvironmentReading } from '../environment/environment.entities';
import { EnvironmentModule } from '../environment/environment.module';
import { Instrument } from '../instrument/instrument.entity';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { StorageLocation } from '../instrument/storage-location.entity';
import { Customer } from '../jobs/customer.entity';
import { Job } from '../jobs/job.entity';
import { AccreditationScope } from '../scope/accreditation-scope.entity';
import { InstrumentModule } from '../instrument/instrument.module';
import { AppUser } from '../security/app-user.entity';
import { UsageRecord } from '../usage/usage-record.entity';
import { DemoEstateBootstrap } from './demo-estate.bootstrap';
import { DemoEstateService } from './demo-estate.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Instrument,
      UsageRecord,
      AppUser,
      Competence,
      InstrumentClass,
      StorageLocation,
      AccreditationScope,
      EnvironmentLimitRecord,
      EnvironmentReading,
      Customer,
      Job,
    ]),
    InstrumentModule,
    CalibrationModule,
    CompetenceModule,
    EnvironmentModule,
  ],
  providers: [DemoEstateService, DemoEstateBootstrap],
  exports: [DemoEstateService],
})
export class DemoModule {}
