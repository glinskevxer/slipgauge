import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { RuleViolationError } from '../common/errors';
import { ImpactAssessment } from './impact-assessment.entity';
import { ImpactDisposition, ImpactKind, isSettled } from './impact-severity';

/**
 * One thing the cascade caught. The reference id points into whichever table
 * the kind names, which is a deliberate soft link: an item stays readable even
 * after the certificate it names has been superseded.
 */
@Entity({ name: 'impact_item' })
export class ImpactItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ImpactAssessment, (assessment) => assessment.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assessment_id' })
  assessment: ImpactAssessment;

  @Column({ type: 'varchar', length: 16 })
  kind: ImpactKind;

  @Column({ name: 'reference_id', type: 'int' })
  referenceId: number;

  @Column({ name: 'asset_tag', type: 'varchar', length: 32, nullable: true })
  assetTag: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  label: string | null;

  @Column({ name: 'occurred_on', type: 'date' })
  occurredOn: string;

  @Column({ type: 'int' })
  depth: number;

  @Column({ type: 'varchar', length: 24, default: ImpactDisposition.PENDING })
  disposition: ImpactDisposition;

  @Column({ type: 'varchar', length: 400, nullable: true })
  note: string | null;

  settled(): boolean {
    return isSettled(this.disposition);
  }

  /**
   * A disposition other than PENDING has to say why. The quality manager signs
   * the assessment off on these notes, so an unexplained NO_EFFECT is the one
   * line that would make the whole record worthless.
   */
  dispose(disposition: ImpactDisposition, note: string | null): void {
    if (disposition !== ImpactDisposition.PENDING && !note?.trim()) {
      throw new RuleViolationError(`disposing an item as ${disposition} needs a note`);
    }
    this.disposition = disposition;
    this.note = note?.trim() ?? null;
  }

  /** How the line reads on the report. */
  describe(): string {
    const what = this.label ?? String(this.referenceId);

    return this.assetTag ? `${this.assetTag}: ${what}` : what;
  }
}

export function impactItem(
  kind: ImpactKind,
  referenceId: number,
  assetTag: string | null,
  label: string | null,
  occurredOn: string,
  depth: number,
): ImpactItem {
  const item = new ImpactItem();

  item.kind = kind;
  item.referenceId = referenceId;
  item.assetTag = assetTag;
  item.label = label === null ? null : label.slice(0, 200);
  item.occurredOn = occurredOn;
  item.depth = depth;
  item.disposition = ImpactDisposition.PENDING;
  item.note = null;
  return item;
}
