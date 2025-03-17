import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstrumentModule } from '../instrument/instrument.module';
import { CalibrationCertificate } from './calibration-certificate.entity';
import { ConformityAssessor } from './conformity';
import { MeasurementPoint } from './measurement-point.entity';
import { ToleranceProfile } from './tolerance-profile.entity';
import { ToleranceProfileService } from './tolerance-profile.service';

@Module({
  imports: [TypeOrmModule.forFeature([ToleranceProfile, CalibrationCertificate, MeasurementPoint]), InstrumentModule],
  providers: [ConformityAssessor, ToleranceProfileService],
  exports: [TypeOrmModule, ConformityAssessor, ToleranceProfileService],
})
export class CalibrationModule {}
