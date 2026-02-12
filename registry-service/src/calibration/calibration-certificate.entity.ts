import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
  VersionColumn,
} from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';
import { RuleViolationError } from '../common/errors';
import { numericTransformer } from '../common/numeric';
import { Instrument } from '../instrument/instrument.entity';
import { StorageLocation } from '../instrument/storage-location.entity';
import { Verdict, worseOf } from './conformity';
import { MeasurementPoint } from './measurement-point.entity';

/**
 * The record of one calibration. Certificates are append only: a mistake is
 * corrected by withdrawing this one and issuing a replacement that points back
 * at it, because an accreditation audit has to be able to see both.
 */
@Entity({ name: 'calibration_certificate' })
export class CalibrationCertificate extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'certificate_number', type: 'varchar', length: 48 })
  certificateNumber: string;

  @ManyToOne(() => Instrument)
  @JoinColumn({ name: 'instrument_id' })
  instrument: Instrument;

  @RelationId((certificate: CalibrationCertificate) => certificate.instrument)
  instrumentId: number;

  @Column({ name: 'performed_on', type: 'date' })
  performedOn: string;

  @Column({ name: 'issued_on', type: 'date' })
  issuedOn: string;

  @Column({ name: 'performed_by', type: 'varchar', length: 120 })
  performedBy: string;

  @Column({ name: 'approved_by', type: 'varchar', length: 120, nullable: true })
  approvedBy: string | null;

  @Column({ name: 'issuing_lab', type: 'varchar', length: 120 })
  issuingLab: string;

  @Column({ name: 'external_lab', type: 'boolean', default: false })
  externalLab: boolean;

  @Column({
    name: 'ambient_temp_c',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  ambientTemperature: number | null;

  @Column({
    name: 'ambient_humidity',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  ambientHumidity: number | null;

  @Column({ name: 'as_found_verdict', type: 'varchar', length: 24 })
  asFoundVerdict: Verdict;

  @Column({ name: 'as_left_verdict', type: 'varchar', length: 24 })
  asLeftVerdict: Verdict;

  @Column({ type: 'boolean', default: false })
  adjusted: boolean;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  remarks: string | null;

  /**
   * The room the measurement was made in, which is not always where the
   * instrument lives. Null on a certificate filed by another laboratory,
   * because their rooms are their business.
   */
  @ManyToOne(() => StorageLocation, { nullable: true })
  @JoinColumn({ name: 'performed_in_location_id' })
  performedIn: StorageLocation | null;

  @RelationId((certificate: CalibrationCertificate) => certificate.performedIn)
  performedInId: number | null;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;

  @Column({ name: 'withdrawn_reason', type: 'varchar', length: 400, nullable: true })
  withdrawnReason: string | null;

  @ManyToOne(() => CalibrationCertificate, { nullable: true })
  @JoinColumn({ name: 'superseded_by_id' })
  supersededBy: CalibrationCertificate | null;

  @RelationId((certificate: CalibrationCertificate) => certificate.supersededBy)
  supersededById: number | null;

  @OneToMany(() => MeasurementPoint, (point) => point.certificate, {
    cascade: true,
    eager: false,
  })
  points: MeasurementPoint[];

  @VersionColumn({ name: 'row_version' })
  rowVersion: number;

  addPoint(point: MeasurementPoint): void {
    this.points = this.points ?? [];
    point.certificate = this;
    this.points.push(point);
  }

  /** The points in the order the technician worked through them. */
  orderedPoints(): MeasurementPoint[] {
    return [...(this.points ?? [])].sort((left, right) => left.sequenceNo - right.sequenceNo);
  }

  /**
   * Rolls the point verdicts up into the two certificate level ones. Called
   * once every point has been judged, never on a partially populated set.
   */
  rollUpVerdicts(): void {
    const points = this.points ?? [];

    if (points.length === 0) {
      throw new RuleViolationError(
        `certificate ${this.certificateNumber} carries no measurement points`,
      );
    }

    let found = Verdict.PASS;
    let left = Verdict.PASS;

    for (const point of points) {
      found = worseOf(found, point.asFoundVerdict);
      left = worseOf(left, point.asLeftVerdict);
    }
    this.asFoundVerdict = found;
    this.asLeftVerdict = left;
  }

  isWithdrawn(): boolean {
    return this.withdrawnAt !== null && this.withdrawnAt !== undefined;
  }

  /** True while this certificate still speaks for the instrument. */
  isLive(): boolean {
    return !this.isWithdrawn() && !this.supersededBy && !this.supersededById;
  }

  withdraw(reason: string, at: Date): void {
    if (!reason || !reason.trim()) {
      throw new RuleViolationError('withdrawing a certificate needs a reason');
    }
    if (this.isWithdrawn()) {
      throw new RuleViolationError(
        `certificate ${this.certificateNumber} was already withdrawn`,
      );
    }
    this.withdrawnAt = at;
    this.withdrawnReason = reason;
  }

  supersede(replacement: CalibrationCertificate): void {
    if (replacement === this) {
      throw new RuleViolationError('a certificate cannot supersede itself');
    }
    this.supersededBy = replacement;
  }

  markAdjusted(adjusted: boolean): void {
    this.adjusted = adjusted;
  }

  /**
   * Approval is a second pair of eyes, so the technician who did the work
   * cannot sign it off. That is a clause of the accreditation, not a policy
   * this service is free to relax.
   */
  approve(approver: string): void {
    if (!approver || !approver.trim()) {
      throw new RuleViolationError('an approver is required');
    }
    if (approver === this.performedBy) {
      throw new RuleViolationError('the technician who performed the work cannot approve it');
    }
    this.approvedBy = approver;
  }

  recordAmbient(temperature: number | null, humidity: number | null): void {
    this.ambientTemperature = temperature;
    this.ambientHumidity = humidity;
  }
}

/** Builds a certificate with the dates already checked against each other. */
export function calibrationCertificate(
  certificateNumber: string,
  instrument: Instrument,
  performedOn: string,
  issuedOn: string,
  performedBy: string,
  issuingLab: string,
): CalibrationCertificate {
  if (issuedOn < performedOn) {
    throw new RuleViolationError('a certificate cannot be issued before the work was done');
  }

  const certificate = new CalibrationCertificate();

  certificate.certificateNumber = certificateNumber;
  certificate.instrument = instrument;
  certificate.performedOn = performedOn;
  certificate.issuedOn = issuedOn;
  certificate.performedBy = performedBy;
  certificate.issuingLab = issuingLab;
  certificate.approvedBy = null;
  certificate.externalLab = false;
  certificate.ambientTemperature = null;
  certificate.ambientHumidity = null;
  certificate.asFoundVerdict = Verdict.NOT_ASSESSED;
  certificate.asLeftVerdict = Verdict.NOT_ASSESSED;
  certificate.adjusted = false;
  certificate.remarks = null;
  certificate.withdrawnAt = null;
  certificate.withdrawnReason = null;
  certificate.supersededBy = null;
  certificate.points = [];
  return certificate;
}
