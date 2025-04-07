import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { CertificateStandard } from './certificate-standard.entity';
import { TraceabilityValidator } from './traceability.validator';

/**
 * Deliberately does not import the calibration module. The walk needs the
 * certificate repository and nothing else from it, and taking the whole module
 * would make the two import each other, which Nest can only resolve with a
 * forward reference that hides the cycle rather than removing it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CertificateStandard, CalibrationCertificate])],
  providers: [TraceabilityValidator],
  exports: [TypeOrmModule, TraceabilityValidator],
})
export class TraceabilityModule {}
