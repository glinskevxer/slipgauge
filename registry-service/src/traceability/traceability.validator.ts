import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { serviceable } from '../calibration/conformity';
import { Instrument } from '../instrument/instrument.entity';
import { CertificateStandard } from './certificate-standard.entity';
import { ChainDefect, chainDefect } from './chain-defect';
import { ChainReport } from './chain-report';
import { carriesTraceability } from './standard-role';

/** A chain deeper than this is not a chain, it is a loop we failed to spot. */
export const MAX_CHAIN_DEPTH = 12;

/** Mutable state of one walk, kept off the service so two can run at once. */
interface Walk {
  readonly defects: ChainDefect[];
  readonly visited: Set<number>;
  reachedOutside: boolean;
}

/**
 * Walks a certificate's standards and decides whether the chain holds.
 *
 * <p>The rule that matters is the one about time. A standard's own certificate
 * has to have covered the day it was used, not the day someone looks. That is
 * what lets a chain go bad retroactively when a standard is found out of
 * tolerance months later, and it is why the walk takes the date from the
 * certificate rather than reading the clock.
 */
@Injectable()
export class TraceabilityValidator {
  constructor(
    @InjectRepository(CertificateStandard) private readonly edges: Repository<CertificateStandard>,
    @InjectRepository(CalibrationCertificate)
    private readonly certificates: Repository<CalibrationCertificate>,
  ) {}

  async validate(certificate: CalibrationCertificate): Promise<ChainReport> {
    const walk: Walk = { defects: [], visited: new Set<number>(), reachedOutside: false };
    const depth = await this.descend(walk, certificate, 0);

    return walk.defects.length === 0
      ? ChainReport.sound(depth, walk.reachedOutside)
      : ChainReport.broken(depth, walk.reachedOutside, walk.defects);
  }

  private async descend(
    walk: Walk,
    certificate: CalibrationCertificate,
    depth: number,
  ): Promise<number> {
    if (depth >= MAX_CHAIN_DEPTH) {
      walk.defects.push(chainDefect.circular(certificate.instrument.assetTag));
      return depth;
    }

    const used = await this.edges.find({
      where: { certificate: { id: certificate.id } },
      relations: { standard: { instrumentClass: true } },
      order: { id: 'ASC' },
    });
    const references = used.filter((edge) => carriesTraceability(edge.role));

    if (references.length === 0) {
      walk.defects.push(chainDefect.missingReference());
      return depth;
    }

    let deepest = depth;
    for (const edge of references) {
      deepest = Math.max(deepest, await this.follow(walk, edge, certificate.performedOn, depth));
    }
    return deepest;
  }

  private async follow(
    walk: Walk,
    edge: CertificateStandard,
    usedOn: string,
    depth: number,
  ): Promise<number> {
    if (!edge.isInternal()) {
      if (edge.externallyValidOn(usedOn)) {
        walk.reachedOutside = true;
      } else {
        walk.defects.push(chainDefect.externalWindow(edge.describe(), usedOn));
      }
      return depth + 1;
    }

    const standard = edge.standard as Instrument;

    if (walk.visited.has(standard.id)) {
      walk.defects.push(chainDefect.circular(standard.assetTag));
      return depth + 1;
    }
    walk.visited.add(standard.id);

    if (!standard.isReference) {
      walk.defects.push(chainDefect.notAStandard(standard.assetTag));
    }

    const covering = await this.effectiveOn(standard.id, usedOn);

    if (!covering) {
      walk.defects.push(chainDefect.noCertificate(standard.assetTag, usedOn));
      return depth + 1;
    }

    if (!serviceable(covering.asLeftVerdict)) {
      walk.defects.push(chainDefect.notServiceable(standard.assetTag, covering.asLeftVerdict));
    }

    const dueOn = addDays(covering.performedOn, standard.instrumentClass.baseIntervalDays);

    if (usedOn > dueOn) {
      walk.defects.push(chainDefect.overdue(standard.assetTag, dueOn, usedOn));
    }
    return this.descend(walk, covering, depth + 1);
  }

  /**
   * The live certificate that spoke for this standard on the given day. Newest
   * first, so a standard calibrated twice before the date in question is read
   * through the later visit.
   */
  private async effectiveOn(
    instrumentId: number,
    on: string,
  ): Promise<CalibrationCertificate | null> {
    return this.certificates.findOne({
      where: {
        instrument: { id: instrumentId },
        performedOn: LessThanOrEqual(on),
        withdrawnAt: IsNull(),
      },
      relations: { instrument: { instrumentClass: true } },
      order: { performedOn: 'DESC', id: 'DESC' },
    });
  }
}

/** Dates are ISO strings everywhere in this service, so this stays local. */
function addDays(from: string, days: number): string {
  const date = new Date(`${from}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
