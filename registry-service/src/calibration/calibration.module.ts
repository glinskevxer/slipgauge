import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompetenceModule } from '../competence/competence.module';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { InstrumentModule } from '../instrument/instrument.module';
import { ScopeModule } from '../scope/scope.module';
import { ImpactModule } from '../impact/impact.module';
import { IntervalModule } from '../interval/interval.module';
import { TraceabilityModule } from '../traceability/traceability.module';
import { SecurityModule } from '../security/security.module';
import { AttachmentService } from './attachment.service';
import { CalibrationCertificate } from './calibration-certificate.entity';
import { CertificateAttachment } from './certificate-attachment.entity';
import { CalibrationController, CertificateHistoryController } from './calibration.controller';
import { CalibrationMapper } from './calibration.mapper';
import { CalibrationService } from './calibration.service';
import { ConformityAssessor } from './conformity';
import { MeasurementPoint } from './measurement-point.entity';
import { ToleranceProfile } from './tolerance-profile.entity';
import { ToleranceProfileController } from './tolerance-profile.controller';
import { ToleranceProfileService } from './tolerance-profile.service';

@Module({
  imports: [
    CompetenceModule,
    TypeOrmModule.forFeature([
      ToleranceProfile,
      CalibrationCertificate,
      MeasurementPoint,
      CertificateAttachment,
      InstrumentClass,
    ]),
    SecurityModule,
    InstrumentModule,
    ScopeModule,
    TraceabilityModule,
    IntervalModule,
    ImpactModule,
  ],
  controllers: [
    CalibrationController,
    CertificateHistoryController,
    ToleranceProfileController,
  ],
  providers: [
    ConformityAssessor,
    ToleranceProfileService,
    CalibrationService,
    CalibrationMapper,
    AttachmentService,
  ],
  exports: [
    TypeOrmModule,
    ConformityAssessor,
    ToleranceProfileService,
    CalibrationService,
    AttachmentService,
  ],
})
export class CalibrationModule {}
