import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { NotFoundError, RuleViolationError } from '../common/errors';
import { Instrument } from '../instrument/instrument.entity';
import { ToleranceBand } from './conformity';
import { ToleranceProfile } from './tolerance-profile.entity';

/**
 * Finds the profile an instrument is held to and turns it into a band.
 *
 * <p>Resolution is instrument first, then class, then nothing. That order is
 * the whole point of the nullable link: a customer owned gauge block set held
 * to a tighter grade than the laboratory's own is one row, not a new class.
 */
@Injectable()
export class ToleranceProfileService {
  constructor(
    @InjectRepository(ToleranceProfile) private readonly profiles: Repository<ToleranceProfile>,
  ) {}

  async byCode(code: string): Promise<ToleranceProfile> {
    const profile = await this.profiles.findOne({
      where: { code },
      relations: { instrumentClass: true },
    });

    if (!profile) {
      throw new NotFoundError('tolerance profile', code);
    }
    return profile;
  }

  async list(): Promise<ToleranceProfile[]> {
    return this.profiles.find({ relations: { instrumentClass: true }, order: { code: 'ASC' } });
  }

  /** The profiles nothing points at, which the quality manager reviews yearly. */
  async unattached(): Promise<ToleranceProfile[]> {
    return this.profiles.find({ where: { instrumentClass: IsNull() }, order: { code: 'ASC' } });
  }

  /**
   * The profile this instrument is judged against, or null when neither it nor
   * its class carries one. A null is a legitimate state, so it is returned
   * rather than thrown; the caller decides whether it can proceed.
   */
  async resolveFor(instrument: Instrument): Promise<ToleranceProfile | null> {
    if (instrument.toleranceProfileId !== null && instrument.toleranceProfileId !== undefined) {
      return this.profiles.findOne({
        where: { id: instrument.toleranceProfileId },
        relations: { instrumentClass: true },
      });
    }

    const classId = instrument.instrumentClass?.id;
    if (classId === undefined) {
      return null;
    }
    return this.profiles.findOne({
      where: { instrumentClass: { id: classId } },
      relations: { instrumentClass: true },
    });
  }

  /**
   * The band this instrument is held to at one nominal. The span comes from
   * the instrument itself, because a percent of span profile is meaningless
   * without it.
   */
  async bandFor(instrument: Instrument, nominal: number): Promise<ToleranceBand> {
    const profile = await this.resolveFor(instrument);

    if (!profile) {
      throw new RuleViolationError(
        `instrument ${instrument.assetTag} has no tolerance profile and none can be inherited ` +
          `from its class`,
      );
    }
    return profile.bandAt(nominal, instrument.span());
  }

  /** True when the nominal sits inside what the instrument can actually read. */
  covers(instrument: Instrument, nominal: number): boolean {
    return instrument.covers(nominal);
  }
}
