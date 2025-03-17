import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { RuleViolationError } from '../common/errors';
import { numericTransformer, requiredNumericTransformer } from '../common/numeric';
import { CalibrationCertificate } from './calibration-certificate.entity';
import { ToleranceBand, Verdict } from './conformity';

/**
 * One nominal value on a certificate, with what the instrument read before any
 * adjustment and after it. As found is the number that matters to everyone
 * downstream: it is the evidence about how the instrument behaved in service.
 */
@Entity({ name: 'measurement_point' })
export class MeasurementPoint {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => CalibrationCertificate, (certificate) => certificate.points, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'certificate_id' })
  certificate: CalibrationCertificate;

  @Column({ name: 'sequence_no', type: 'integer' })
  sequenceNo: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label: string | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 9,
    transformer: requiredNumericTransformer,
  })
  nominal: number;

  @Column({ type: 'varchar', length: 24 })
  unit: string;

  @Column({
    name: 'as_found',
    type: 'numeric',
    precision: 18,
    scale: 9,
    nullable: true,
    transformer: numericTransformer,
  })
  asFound: number | null;

  @Column({
    name: 'as_left',
    type: 'numeric',
    precision: 18,
    scale: 9,
    nullable: true,
    transformer: numericTransformer,
  })
  asLeft: number | null;

  @Column({
    name: 'tolerance_low',
    type: 'numeric',
    precision: 18,
    scale: 9,
    transformer: requiredNumericTransformer,
  })
  toleranceLow: number;

  @Column({
    name: 'tolerance_high',
    type: 'numeric',
    precision: 18,
    scale: 9,
    transformer: requiredNumericTransformer,
  })
  toleranceHigh: number;

  @Column({
    name: 'expanded_uncertainty',
    type: 'numeric',
    precision: 18,
    scale: 9,
    transformer: requiredNumericTransformer,
  })
  expandedUncertainty: number;

  @Column({
    name: 'coverage_factor',
    type: 'numeric',
    precision: 6,
    scale: 3,
    default: 2,
    transformer: requiredNumericTransformer,
  })
  coverageFactor: number;

  @Column({ name: 'as_found_verdict', type: 'varchar', length: 24 })
  asFoundVerdict: Verdict;

  @Column({ name: 'as_left_verdict', type: 'varchar', length: 24 })
  asLeftVerdict: Verdict;

  tolerance(): ToleranceBand {
    return new ToleranceBand(this.nominal, this.toleranceLow, this.toleranceHigh);
  }

  /** The error the instrument showed on arrival, positive when reading high. */
  asFoundError(): number | null {
    return this.asFound === null ? null : this.asFound - this.nominal;
  }

  asLeftError(): number | null {
    return this.asLeft === null ? null : this.asLeft - this.nominal;
  }

  /**
   * How much of the permitted band the as found error used up, as a fraction.
   * The drift chart plots this rather than the raw error, so points with very
   * different tolerances can share one vertical axis.
   */
  normalisedAsFoundError(): number | null {
    const error = this.asFoundError();
    const halfWidth = this.tolerance().halfWidth();

    if (error === null || halfWidth === 0) {
      return null;
    }
    return error / halfWidth;
  }

  recordAsFound(value: number | null, verdict: Verdict): void {
    this.asFound = value;
    this.asFoundVerdict = verdict;
  }

  recordAsLeft(value: number | null, verdict: Verdict): void {
    this.asLeft = value;
    this.asLeftVerdict = verdict;
  }

  setCoverageFactor(coverageFactor: number): void {
    if (!(coverageFactor > 0)) {
      throw new RuleViolationError('a coverage factor must be positive');
    }
    this.coverageFactor = coverageFactor;
  }

  /** True when the point was adjusted on the bench rather than left alone. */
  wasAdjusted(): boolean {
    return this.asFound !== null && this.asLeft !== null && this.asFound !== this.asLeft;
  }
}

/** Builds a point from the tolerance it will be judged against. */
export function measurementPoint(
  sequenceNo: number,
  nominal: number,
  unit: string,
  tolerance: ToleranceBand,
  expandedUncertainty: number,
): MeasurementPoint {
  const point = new MeasurementPoint();

  point.sequenceNo = sequenceNo;
  point.nominal = nominal;
  point.unit = unit;
  point.label = null;
  point.toleranceLow = tolerance.low;
  point.toleranceHigh = tolerance.high;
  point.expandedUncertainty = expandedUncertainty;
  point.coverageFactor = 2;
  point.asFound = null;
  point.asLeft = null;
  point.asFoundVerdict = Verdict.NOT_ASSESSED;
  point.asLeftVerdict = Verdict.NOT_ASSESSED;
  return point;
}
