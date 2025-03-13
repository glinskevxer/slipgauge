import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, RelationId } from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';
import { RuleViolationError } from '../common/errors';
import { requiredNumericTransformer } from '../common/numeric';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { ToleranceBand, ToleranceKind } from './conformity';

/** Proportional terms are stored in parts per million, so this scales them. */
const PPM = 0.000001;

/**
 * The maximum permissible error a class of instrument is held to. Written the
 * way manufacturers write it, as a sum of a fixed term, a term proportional to
 * the reading and a term proportional to the span, with a floor underneath.
 */
@Entity({ name: 'tolerance_profile' })
export class ToleranceProfile extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @ManyToOne(() => InstrumentClass, { nullable: true })
  @JoinColumn({ name: 'class_id' })
  instrumentClass: InstrumentClass | null;

  @RelationId((profile: ToleranceProfile) => profile.instrumentClass)
  classId: number | null;

  @Column({ type: 'varchar', length: 24 })
  kind: ToleranceKind;

  @Column({
    name: 'absolute_term',
    type: 'numeric',
    precision: 18,
    scale: 9,
    transformer: requiredNumericTransformer,
  })
  absoluteTerm: number;

  @Column({
    name: 'reading_ppm',
    type: 'numeric',
    precision: 18,
    scale: 6,
    transformer: requiredNumericTransformer,
  })
  readingPpm: number;

  @Column({
    name: 'span_ppm',
    type: 'numeric',
    precision: 18,
    scale: 6,
    transformer: requiredNumericTransformer,
  })
  spanPpm: number;

  @Column({
    name: 'floor_term',
    type: 'numeric',
    precision: 18,
    scale: 9,
    transformer: requiredNumericTransformer,
  })
  floorTerm: number;

  /**
   * The permitted window at one nominal value.
   *
   * <p>The reading term uses the magnitude of the nominal, so a specification
   * written for a positive scale still behaves on a bipolar range. The floor is
   * applied last and can only widen the band, never narrow it.
   */
  bandAt(nominal: number, span: number | null): ToleranceBand {
    const halfWidth = this.halfWidthAt(nominal, span);
    return ToleranceBand.symmetric(nominal, Math.max(halfWidth, this.floorTerm));
  }

  private halfWidthAt(nominal: number, span: number | null): number {
    switch (this.kind) {
      case ToleranceKind.ABSOLUTE:
        return this.absoluteTerm;
      case ToleranceKind.PERCENT_OF_READING:
        return this.readingTerm(nominal);
      case ToleranceKind.PERCENT_OF_SPAN:
        return this.spanTerm(span);
      case ToleranceKind.COMBINED:
        return this.absoluteTerm + this.readingTerm(nominal) + this.spanTerm(span);
      default:
        throw new RuleViolationError(`profile ${this.code} has no rule for kind ${this.kind}`);
    }
  }

  private readingTerm(nominal: number): number {
    return this.readingPpm * PPM * Math.abs(nominal);
  }

  private spanTerm(span: number | null): number {
    if (span === null || span === undefined) {
      return 0;
    }
    return this.spanPpm * PPM * Math.abs(span);
  }

  withTerms(absolute: number, readingPpm: number, spanPpm: number, floor: number): this {
    this.absoluteTerm = requireNonNegative(absolute, 'absolute term');
    this.readingPpm = requireNonNegative(readingPpm, 'reading term');
    this.spanPpm = requireNonNegative(spanPpm, 'span term');
    this.floorTerm = requireNonNegative(floor, 'floor term');
    return this;
  }

  /** True when nothing about the profile depends on where you are on the scale. */
  isFlat(): boolean {
    return this.kind === ToleranceKind.ABSOLUTE || this.kind === ToleranceKind.PERCENT_OF_SPAN;
  }

  /** How the profile reads on a certificate, in the instrument's own unit. */
  describe(unit: string): string {
    const terms: string[] = [];

    if (this.kind === ToleranceKind.ABSOLUTE || this.kind === ToleranceKind.COMBINED) {
      terms.push(`${this.absoluteTerm} ${unit}`);
    }
    if (this.kind === ToleranceKind.PERCENT_OF_READING || this.kind === ToleranceKind.COMBINED) {
      terms.push(`${this.readingPpm} ppm of reading`);
    }
    if (this.kind === ToleranceKind.PERCENT_OF_SPAN || this.kind === ToleranceKind.COMBINED) {
      terms.push(`${this.spanPpm} ppm of span`);
    }
    const body = terms.length > 0 ? terms.join(' plus ') : `0 ${unit}`;

    return this.floorTerm > 0 ? `${body}, floor ${this.floorTerm} ${unit}` : body;
  }
}

function requireNonNegative(value: number, what: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RuleViolationError(`the ${what} cannot be negative`);
  }
  return value;
}

/** Builds a detached profile, which is what the seeds and the tests want. */
export function toleranceProfile(
  code: string,
  name: string,
  kind: ToleranceKind,
): ToleranceProfile {
  const profile = new ToleranceProfile();

  profile.code = code;
  profile.name = name;
  profile.kind = kind;
  profile.instrumentClass = null;
  return profile.withTerms(0, 0, 0, 0);
}
