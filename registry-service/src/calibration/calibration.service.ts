import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ConflictError, NotFoundError, RuleViolationError } from '../common/errors';
import { Clock } from '../config/clock';
import { Instrument } from '../instrument/instrument.entity';
import { CalibrationCertificate, calibrationCertificate } from './calibration-certificate.entity';
import { CalibrationMapper } from './calibration.mapper';
import { ConformityAssessor } from './conformity';
import type { CertificateView } from './dto/certificate.views';
import {
  MeasurementPointInput,
  RecordCalibrationDto,
  asLeftOf,
  coverageFactorOf,
  policyOf,
} from './dto/record-calibration.dto';
import { MeasurementPoint, measurementPoint } from './measurement-point.entity';
import { ToleranceProfile } from './tolerance-profile.entity';
import { ToleranceProfileService } from './tolerance-profile.service';

/** Relations every read of a certificate needs to render a full view. */
const CERTIFICATE_RELATIONS = { instrument: true, points: true } as const;

/**
 * Takes a completed calibration sheet and turns it into a certificate.
 *
 * <p>The tolerance limits and the verdicts are worked out here, from the
 * profile the instrument is held to and the uncertainty the bench reported.
 * Nothing the bench sends can set a limit or a verdict directly.
 */
@Injectable()
export class CalibrationService {
  private readonly log = new Logger(CalibrationService.name);

  constructor(
    @InjectRepository(CalibrationCertificate)
    private readonly certificates: Repository<CalibrationCertificate>,
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    private readonly profiles: ToleranceProfileService,
    private readonly assessor: ConformityAssessor,
    private readonly mapper: CalibrationMapper,
    private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  async record(request: RecordCalibrationDto): Promise<CertificateView> {
    const instrument = await this.instrumentByTag(request.assetTag);

    const duplicate = await this.certificates.findOne({
      where: {
        issuingLab: request.issuingLab,
        certificateNumber: request.certificateNumber,
      },
    });

    if (duplicate) {
      throw ConflictError.duplicate(
        'certificate',
        `${request.issuingLab} ${request.certificateNumber}`,
      );
    }

    if (request.performedOn < instrument.acquiredOn) {
      throw new RuleViolationError(
        `certificate ${request.certificateNumber} is dated before the instrument was acquired`,
      );
    }
    if (request.performedOn > this.clock.today()) {
      throw new RuleViolationError('a calibration cannot be dated in the future');
    }

    const profile = await this.resolveProfile(instrument);

    const certificate = calibrationCertificate(
      request.certificateNumber,
      instrument,
      request.performedOn,
      request.issuedOn,
      request.performedBy,
      request.issuingLab,
    );

    certificate.externalLab = request.externalLab ?? false;
    certificate.markAdjusted(request.adjusted ?? false);
    certificate.remarks = request.remarks ?? null;
    certificate.recordAmbient(request.ambientTemperature ?? null, request.ambientHumidity ?? null);

    this.addPoints(certificate, instrument, profile, request);
    certificate.rollUpVerdicts();

    const saved = await this.dataSource.transaction(async (manager) =>
      manager.getRepository(CalibrationCertificate).save(certificate),
    );

    this.log.log(
      `recorded certificate ${saved.certificateNumber} for ${instrument.assetTag} ` +
        `as found ${saved.asFoundVerdict} as left ${saved.asLeftVerdict}`,
    );
    return this.get(saved.id);
  }

  /**
   * Every point is judged twice, once on arrival and once on what the bench
   * left behind. A sheet with no as left value means nothing was adjusted, so
   * the as found reading stands for both.
   */
  private addPoints(
    certificate: CalibrationCertificate,
    instrument: Instrument,
    profile: ToleranceProfile,
    request: RecordCalibrationDto,
  ): void {
    const seen = new Set<number>();
    const policy = policyOf(request);
    const span = instrument.span();

    for (const input of request.points) {
      if (seen.has(input.sequenceNo)) {
        throw new RuleViolationError(`point ${input.sequenceNo} appears more than once`);
      }
      seen.add(input.sequenceNo);

      if (!instrument.covers(input.nominal)) {
        throw new RuleViolationError(
          `nominal ${input.nominal} sits outside the range of ${instrument.assetTag}`,
        );
      }
      certificate.addPoint(this.buildPoint(input, instrument, profile, span, policy));
    }
  }

  private buildPoint(
    input: MeasurementPointInput,
    instrument: Instrument,
    profile: ToleranceProfile,
    span: number,
    policy: ReturnType<typeof policyOf>,
  ): MeasurementPoint {
    const band = profile.bandAt(input.nominal, span);
    const point = measurementPoint(
      input.sequenceNo,
      input.nominal,
      instrument.unit,
      band,
      input.expandedUncertainty,
    );

    point.label = input.label ?? null;
    point.setCoverageFactor(coverageFactorOf(input));

    const asFound = input.asFound ?? null;
    const asLeft = asLeftOf(input);

    point.recordAsFound(
      asFound,
      this.assessor.assess(asFound, band, input.expandedUncertainty, policy).verdict,
    );
    point.recordAsLeft(
      asLeft,
      this.assessor.assess(asLeft, band, input.expandedUncertainty, policy).verdict,
    );
    return point;
  }

  async get(id: number): Promise<CertificateView> {
    return this.mapper.toView(await this.load(id));
  }

  /** Every certificate still speaking for the instrument, newest visit first. */
  async historyFor(assetTag: string): Promise<CertificateView[]> {
    const instrument = await this.instrumentByTag(assetTag);

    const found = await this.certificates.find({
      where: { instrument: { id: instrument.id } },
      relations: CERTIFICATE_RELATIONS,
      order: { performedOn: 'DESC', id: 'DESC' },
    });

    return found.filter((certificate) => !certificate.isWithdrawn()).map((certificate) =>
      this.mapper.toView(certificate),
    );
  }

  async approve(id: number, approver: string): Promise<CertificateView> {
    const certificate = await this.load(id);

    certificate.approve(approver);
    await this.certificates.save(certificate);
    return this.get(id);
  }

  async withdraw(id: number, reason: string): Promise<CertificateView> {
    const certificate = await this.load(id);

    certificate.withdraw(reason, this.clock.now());
    await this.certificates.save(certificate);
    this.log.warn(`certificate ${certificate.certificateNumber} withdrawn, reason ${reason}`);
    return this.get(id);
  }

  async load(id: number): Promise<CalibrationCertificate> {
    const certificate = await this.certificates.findOne({
      where: { id },
      relations: CERTIFICATE_RELATIONS,
    });

    if (!certificate) {
      throw new NotFoundError('certificate', id);
    }
    return certificate;
  }

  private async instrumentByTag(assetTag: string): Promise<Instrument> {
    const instrument = await this.instruments.findOne({
      where: { assetTag },
      relations: { instrumentClass: true },
    });

    if (!instrument) {
      throw new NotFoundError('instrument', assetTag);
    }
    return instrument;
  }

  private async resolveProfile(instrument: Instrument): Promise<ToleranceProfile> {
    const profile = await this.profiles.resolveFor(instrument);

    if (!profile) {
      throw new RuleViolationError(
        `no tolerance profile is set for ${instrument.assetTag} or for class ` +
          `${instrument.instrumentClass.code}`,
      );
    }
    return profile;
  }
}
