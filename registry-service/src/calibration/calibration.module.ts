import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstrumentModule } from '../instrument/instrument.module';
import { TraceabilityModule } from '../traceability/traceability.module';
import { CalibrationCertificate } from './calibration-certificate.entity';
import { CalibrationController, CertificateHistoryController } from './calibration.controller';
import { CalibrationMapper } from './calibration.mapper';
import { CalibrationService } from './calibration.service';
import { ConformityAssessor } from './conformity';
import { MeasurementPoint } from './measurement-point.entity';
import { ToleranceProfile } from './tolerance-profile.entity';
import { ToleranceProfileService } from './tolerance-profile.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ToleranceProfile, CalibrationCertificate, MeasurementPoint]),
    InstrumentModule,
    TraceabilityModule,
  ],
  controllers: [CalibrationController, CertificateHistoryController],
  providers: [
    ConformityAssessor,
    ToleranceProfileService,
    CalibrationService,
    CalibrationMapper,
  ],
  exports: [TypeOrmModule, ConformityAssessor, ToleranceProfileService, CalibrationService],
})
export class CalibrationModule {}
