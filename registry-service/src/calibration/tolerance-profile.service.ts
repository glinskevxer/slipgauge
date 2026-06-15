import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { NotFoundError, RuleViolationError } from '../common/errors';
import { Instrument } from '../instrument/instrument.entity';
import { ToleranceBand } from './conformity';
import { ToleranceProfile } from './tolerance-profile.entity';
import { CacheOptions, ExpiringCache } from '../common/expiring-cache';

/**
 * Finds the profile an instrument is held to and turns it into a band.
 *
 * <p>Resolution is instrument first, then class, then nothing. That order is
 * the whole point of the nullable link: a customer owned gauge block set held
 * to a tighter grade than the laboratory's own is one row, not a new class.
 */
/**
 * Profiles are reference data. They are read on every point of every sheet and
 * written a handful of times a year, so they are held for five minutes.
 */
const CACHE: CacheOptions = { ttlMs: 5 * 60_000, ceiling: 500 };

@Injectable()
export class ToleranceProfileService {
  /**
   * Keyed by class, which is the lookup that repeats. A sheet with twelve
   * points on one instrument asked the same question twelve times, and a busy
   * morning asked it a few thousand.
   *
   * <p>Not keyed by instrument. An instrument specific profile is one row read
   * by primary key and the database is already good at that; the class lookup
   * is the one that scans.
   */
  private readonly byClass = new ExpiringCache<number, ToleranceProfile>(CACHE);

  constructor(
    @InjectRepository(ToleranceProfile) private readonly profiles: Repository<ToleranceProfile>,
  ) {}

  /**
   * Forgets what is held. Called whenever a profile is written or moved between
   * classes: a cache nothing clears is a laboratory judging sheets against a
   * tolerance somebody changed five minutes ago.
   */
  forget(): void {
    this.byClass.clear();
  }

  /** Hits and misses, for the metrics endpoint. */
  cacheStats(): { hits: number; misses: number; entries: number } {
    return this.byClass.stats();
  }

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
    const held = await this.byClass.through(classId, async () => {
      const found = await this.profiles.findOne({
        where: { instrumentClass: { id: classId } },
        relations: { instrumentClass: true },
      });

      return found ?? undefined;
    });

    return held ?? null;
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

  /**
   * Moves a profile onto a class, or off every class.
   *
   * <p>The only write in this service, and the reason `forget` exists at all.
   * A cache with no writer is a cache nobody can prove is cleared, so the two
   * arrived together.
   */
  async assignToClass(code: string, classId: number | null): Promise<ToleranceProfile> {
    const profile = await this.byCode(code);
    const previous = profile.classId;

    profile.instrumentClass = classId === null ? null : ({ id: classId } as never);

    const saved = await this.profiles.save(profile);

    // Both the class it left and the class it joined, because either lookup
    // would otherwise answer from a profile that has moved.
    this.forget();
    void previous;
    return this.byCode(saved.code);
  }

  /** True when the nominal sits inside what the instrument can actually read. */
  covers(instrument: Instrument, nominal: number): boolean {
    return instrument.covers(nominal);
  }
}
