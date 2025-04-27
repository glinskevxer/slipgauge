import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, IsNull, LessThan } from 'typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { serviceable } from '../calibration/conformity';
import { Instrument } from '../instrument/instrument.entity';
import { CertificateStandard } from '../traceability/certificate-standard.entity';
import { StandardRole } from '../traceability/standard-role';
import { UsageRecord } from '../usage/usage-record.entity';
import { ImpactAssessment, impactAssessment } from './impact-assessment.entity';
import { impactItem } from './impact-item.entity';
import { ImpactKind } from './impact-severity';

/** A cascade past this depth is a data problem, not a metrology one. */
export const MAX_CASCADE_DEPTH = 6;

/** State carried down the walk, so the recursion stays readable. */
interface Cascade {
  readonly manager: EntityManager;
  readonly assessment: ImpactAssessment;
  readonly visited: Set<number>;
  readonly seen: Set<string>;
  criticalStandardsHit: number;
}

/**
 * Works out what an out of tolerance result reached.
 *
 * <p>The direct part is easy: everything the instrument measured since it was
 * last known good is suspect. The part that matters is what comes after it. If
 * the instrument was a reference standard, every calibration it signed off in
 * that window rested on a bad measurement, so each of those instruments is
 * suspect too, from the day it was calibrated onwards, and so is everything
 * they went on to touch.
 *
 * <p>That is why the window narrows as the walk descends. A downstream
 * instrument was only compromised from the day the bad standard touched it,
 * not from the day the standard itself went out.
 */
@Injectable()
export class ImpactAnalyser {
  private readonly log = new Logger(ImpactAnalyser.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async analyse(
    failing: CalibrationCertificate,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ImpactAssessment> {
    const instrument = failing.instrument;
    const windowTo = failing.performedOn;
    const windowFrom = await this.lastKnownGood(manager, instrument, windowTo);

    const assessment = impactAssessment(failing, instrument, windowFrom, windowTo);
    const cascade: Cascade = {
      manager,
      assessment,
      visited: new Set<number>([instrument.id]),
      seen: new Set<string>(),
      criticalStandardsHit: 0,
    };

    await this.walk(cascade, instrument, windowFrom, windowTo, 0);

    // The instrument that failed is itself a standard and its error did reach
    // other certificates, so it counts towards the severity in the same way a
    // downstream standard would.
    if (instrument.isReference && this.propagated(assessment)) {
      cascade.criticalStandardsHit += 1;
    }

    assessment.settle(cascade.criticalStandardsHit);

    this.log.warn(
      `impact for ${instrument.assetTag} over ${windowFrom} to ${windowTo}: ` +
        `${assessment.itemCount} items, depth ${assessment.maxDepth}, ` +
        `severity ${assessment.severity}`,
    );
    return assessment;
  }

  private propagated(assessment: ImpactAssessment): boolean {
    return (assessment.items ?? []).some((item) => item.kind === ImpactKind.CERTIFICATE);
  }

  /**
   * The last day the instrument was demonstrably in tolerance. Everything
   * after it is suspect. With no earlier certificate at all the window opens at
   * the day the instrument was booked in, which is the conservative answer and
   * the one an assessor expects to see.
   */
  async lastKnownGood(
    manager: EntityManager,
    instrument: Instrument,
    before: string,
  ): Promise<string> {
    const earlier = await manager.getRepository(CalibrationCertificate).find({
      where: {
        instrument: { id: instrument.id },
        withdrawnAt: IsNull(),
        performedOn: LessThan(before),
      },
      order: { performedOn: 'DESC', id: 'DESC' },
    });

    const good = earlier.find((certificate) => serviceable(certificate.asLeftVerdict));

    return good?.performedOn ?? instrument.acquiredOn;
  }

  private async walk(
    cascade: Cascade,
    instrument: Instrument,
    from: string,
    to: string,
    depth: number,
  ): Promise<void> {
    if (depth > MAX_CASCADE_DEPTH || from > to) {
      return;
    }

    const used = await cascade.manager.getRepository(UsageRecord).find({
      where: { instrument: { id: instrument.id }, usedOn: Between(from, to) },
      order: { usedOn: 'ASC', id: 'ASC' },
    });

    for (const record of used) {
      this.record(
        cascade,
        ImpactKind.USAGE,
        record.id,
        instrument.assetTag,
        record.describe(),
        record.usedOn,
        depth,
      );
    }

    if (!instrument.isReference) {
      return;
    }

    for (const edge of await this.certificatesUsing(cascade.manager, instrument.id, from, to)) {
      const downstream = edge.certificate;
      const affected = downstream.instrument;

      this.record(
        cascade,
        ImpactKind.CERTIFICATE,
        downstream.id,
        affected.assetTag,
        downstream.certificateNumber,
        downstream.performedOn,
        depth + 1,
      );

      if (cascade.visited.has(affected.id)) {
        continue;
      }
      cascade.visited.add(affected.id);

      this.record(
        cascade,
        ImpactKind.INSTRUMENT,
        affected.id,
        affected.assetTag,
        `${affected.manufacturer} ${affected.model}`,
        downstream.performedOn,
        depth + 1,
      );

      if (affected.isReference) {
        cascade.criticalStandardsHit += 1;
      }

      await this.walk(cascade, affected, downstream.performedOn, to, depth + 1);
    }
  }

  /**
   * Every live certificate that leaned on this instrument as its reference
   * inside the window. A check standard is skipped: it confirmed the reading,
   * it did not carry it.
   */
  private async certificatesUsing(
    manager: EntityManager,
    instrumentId: number,
    from: string,
    to: string,
  ): Promise<CertificateStandard[]> {
    return manager
      .getRepository(CertificateStandard)
      .createQueryBuilder('edge')
      .innerJoinAndSelect('edge.certificate', 'certificate')
      .innerJoinAndSelect('certificate.instrument', 'instrument')
      .where('edge.standard_instrument_id = :instrumentId', { instrumentId })
      .andWhere('edge.role = :role', { role: StandardRole.REFERENCE })
      .andWhere('certificate.withdrawn_at is null')
      .andWhere('certificate.performed_on between :from and :to', { from, to })
      .orderBy('certificate.performed_on', 'ASC')
      .addOrderBy('certificate.id', 'ASC')
      .getMany();
  }

  /**
   * Adds a line unless the same thing was already caught down another branch.
   * The table carries the same rule as a unique index; this keeps the walk
   * from relying on a constraint violation to notice.
   */
  private record(
    cascade: Cascade,
    kind: ImpactKind,
    referenceId: number,
    assetTag: string | null,
    label: string | null,
    occurredOn: string,
    depth: number,
  ): void {
    const key = `${kind}:${referenceId}`;

    if (cascade.seen.has(key)) {
      return;
    }
    cascade.seen.add(key);
    cascade.assessment.add(impactItem(kind, referenceId, assetTag, label, occurredOn, depth));
  }
}
