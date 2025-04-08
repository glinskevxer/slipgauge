import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { Verdict, failing } from '../calibration/conformity';
import { Instrument } from '../instrument/instrument.entity';
import { IntervalBasis, IntervalOutcome } from './interval-basis';
import { IntervalPolicy, stepFor } from './interval-policy';

/** Running state of one replay, so the rules below stay readable. */
interface Replay {
  intervalDays: number;
  basis: IntervalBasis;
  rationale: string;
  run: number;
  worstDrift: number | null;
}

/**
 * Works out how long an instrument may run before it is recalled.
 *
 * <p>The engine replays the whole history rather than adjusting from wherever
 * the interval happens to be. That matters because a certificate can be
 * withdrawn years later when a standard it leaned on is found out of
 * tolerance, and the interval that was in force after it has to change with
 * it. An incremental engine cannot undo a step it took on evidence that has
 * since been retracted.
 *
 * <p>Two rules read each other here. The run of clean results decides whether
 * an extension is earned, and the drift measured on those same results decides
 * whether the extension is allowed. An instrument can pass four times running
 * and still not earn a day.
 */
@Injectable()
export class IntervalEngine {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  private policy(): IntervalPolicy {
    return this.config.getOrThrow<IntervalPolicy>('interval');
  }

  /**
   * @param instrument the instrument being reviewed
   * @param history live certificates, oldest first
   */
  decide(instrument: Instrument, history: readonly CalibrationCertificate[]): IntervalOutcome {
    const policy = this.policy();
    const type = instrument.instrumentClass;
    const step = stepFor(policy, type.criticality, type.baseIntervalDays);

    const replay: Replay = {
      intervalDays: type.baseIntervalDays,
      basis: IntervalBasis.BASE,
      rationale: 'no calibration history yet, running at the class base interval',
      run: 0,
      worstDrift: null,
    };

    for (const certificate of history) {
      replay.worstDrift = this.worstDriftOn(certificate);
      this.applyOne(replay, certificate, instrument, policy, step);
    }

    return {
      intervalDays: replay.intervalDays,
      basis: replay.basis,
      consecutivePasses: replay.run,
      driftRatio: replay.worstDrift,
      rationale: replay.rationale,
    };
  }

  private applyOne(
    replay: Replay,
    certificate: CalibrationCertificate,
    instrument: Instrument,
    policy: IntervalPolicy,
    step: number,
  ): void {
    const type = instrument.instrumentClass;
    const found = certificate.asFoundVerdict;

    if (failing(found)) {
      const shortened = Math.round(replay.intervalDays * policy.failureFactor);
      const clamped = type.clampInterval(shortened);

      replay.basis = clamped > shortened ? IntervalBasis.FLOORED : IntervalBasis.SHORTENED;
      replay.rationale =
        `found out of tolerance on ${certificate.certificateNumber}, interval cut from ` +
        `${replay.intervalDays} to ${clamped} days`;
      replay.intervalDays = clamped;
      replay.run = 0;
      return;
    }

    if (found !== Verdict.PASS) {
      replay.run = 0;
      replay.basis = IntervalBasis.HELD;
      replay.rationale =
        `as found ${found.toLowerCase().replace(/_/g, ' ')} on ` +
        `${certificate.certificateNumber}, interval held at ${replay.intervalDays} days`;
      return;
    }

    replay.run += 1;

    if (replay.run < policy.passesBeforeExtension) {
      replay.basis = IntervalBasis.HELD;
      replay.rationale =
        `${replay.run} clean result${replay.run === 1 ? '' : 's'} so far, ` +
        `${policy.passesBeforeExtension} needed before the interval moves`;
      return;
    }

    if (replay.worstDrift !== null && replay.worstDrift > policy.driftBrake) {
      replay.basis = IntervalBasis.HELD;
      replay.rationale =
        `passing but drifting at ${percent(replay.worstDrift)} of tolerance, ` +
        `extension withheld`;
      return;
    }

    const extended = type.clampInterval(replay.intervalDays + step);

    replay.basis = extended < replay.intervalDays + step
      ? IntervalBasis.CAPPED
      : IntervalBasis.EXTENDED;
    replay.rationale =
      `${replay.run} clean results in a row, interval ` +
      (extended === replay.intervalDays
        ? `already at the class ceiling of ${extended}`
        : `moved from ${replay.intervalDays} to ${extended}`) +
      ' days';
    replay.intervalDays = extended;
  }

  /**
   * The worst as found error on a certificate, as a fraction of the permitted
   * half width. Points with no reading are skipped rather than counted as zero
   * drift, which would make a half completed sheet look excellent.
   */
  worstDriftOn(certificate: CalibrationCertificate): number | null {
    let worst = -1;

    for (const point of certificate.points ?? []) {
      const normalised = point.normalisedAsFoundError();

      if (normalised === null) {
        continue;
      }
      worst = Math.max(worst, Math.abs(normalised));
    }
    return worst < 0 ? null : Number(worst.toPrecision(7));
  }
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)} percent`;
}
