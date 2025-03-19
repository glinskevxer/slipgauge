import { Injectable } from '@nestjs/common';

import { CalibrationCertificate } from './calibration-certificate.entity';
import type { CertificateView, MeasurementPointView } from './dto/certificate.views';
import { MeasurementPoint } from './measurement-point.entity';

@Injectable()
export class CalibrationMapper {
  toView(certificate: CalibrationCertificate): CertificateView {
    return {
      id: certificate.id,
      certificateNumber: certificate.certificateNumber,
      instrumentId: certificate.instrument.id,
      assetTag: certificate.instrument.assetTag,
      performedOn: certificate.performedOn,
      issuedOn: certificate.issuedOn,
      performedBy: certificate.performedBy,
      approvedBy: certificate.approvedBy,
      issuingLab: certificate.issuingLab,
      externalLab: certificate.externalLab,
      ambientTemperature: certificate.ambientTemperature,
      ambientHumidity: certificate.ambientHumidity,
      asFoundVerdict: certificate.asFoundVerdict,
      asLeftVerdict: certificate.asLeftVerdict,
      adjusted: certificate.adjusted,
      remarks: certificate.remarks,
      live: certificate.isLive(),
      withdrawnAt: certificate.withdrawnAt ? certificate.withdrawnAt.toISOString() : null,
      withdrawnReason: certificate.withdrawnReason,
      supersededById: certificate.supersededById ?? null,
      points: certificate.orderedPoints().map((point) => this.toPointView(point)),
    };
  }

  toPointView(point: MeasurementPoint): MeasurementPointView {
    return {
      id: point.id,
      sequenceNo: point.sequenceNo,
      label: point.label,
      nominal: point.nominal,
      unit: point.unit,
      asFound: point.asFound,
      asLeft: point.asLeft,
      asFoundError: point.asFoundError(),
      asLeftError: point.asLeftError(),
      normalisedAsFoundError: point.normalisedAsFoundError(),
      toleranceLow: point.toleranceLow,
      toleranceHigh: point.toleranceHigh,
      expandedUncertainty: point.expandedUncertainty,
      coverageFactor: point.coverageFactor,
      asFoundVerdict: point.asFoundVerdict,
      asLeftVerdict: point.asLeftVerdict,
    };
  }
}
