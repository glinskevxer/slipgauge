import { Controller, Get, Param, Put, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Repository } from 'typeorm';

import { NotFoundError } from '../common/errors';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import { ToleranceProfileService } from './tolerance-profile.service';

/** One profile as the administration screen reads it. */
interface ProfileView {
  readonly code: string;
  readonly name: string;
  readonly kind: string;
  readonly classCode: string | null;
  readonly summary: string;
}

/**
 * The tolerance profiles, and the one thing anybody does to them.
 *
 * <p>They live here rather than beside the other reference lists because
 * moving one changes what every verdict on a class means, and the service that
 * resolves them holds a cache that has to be cleared when it happens.
 */
@ApiTags('calibration')
@ApiBearerAuth('registry-token')
@Controller('tolerance-profiles')
export class ToleranceProfileController {
  constructor(
    @InjectRepository(InstrumentClass) private readonly classes: Repository<InstrumentClass>,
    private readonly profiles: ToleranceProfileService,
  ) {}

  @Get()
  async list(): Promise<ProfileView[]> {
    return (await this.profiles.list()).map((profile) => ({
      code: profile.code,
      name: profile.name,
      kind: profile.kind,
      classCode: profile.instrumentClass?.code ?? null,
      summary: profile.describe(unitFor(profile)),
    }));
  }

  /** The ones nothing points at, which the quality manager reviews yearly. */
  @Get('unattached')
  async unattached(): Promise<ProfileView[]> {
    return (await this.profiles.unattached()).map((profile) => ({
      code: profile.code,
      name: profile.name,
      kind: profile.kind,
      classCode: null,
      summary: profile.describe(unitFor(profile)),
    }));
  }

  /** How often the resolver answered from memory, for a look at the cache. */
  @Get('cache')
  cache(): { hits: number; misses: number; entries: number } {
    return this.profiles.cacheStats();
  }

  /**
   * Points a profile at a class, or takes it off every class.
   *
   * <p>An administrator job, and the only write in this part of the register.
   * The resolver's cache is cleared by the service as part of it, so a bench
   * that files a sheet a second later is judged against the profile that is
   * there now.
   */
  @RequireRoles(Role.ADMIN)
  @Put(':code/class')
  async assign(
    @Param('code') code: string,
    @Query('classCode') classCode?: string,
  ): Promise<ProfileView> {
    let type: InstrumentClass | null = null;

    if (classCode) {
      type = await this.classes.findOne({ where: { code: classCode } });

      if (!type) {
        throw new NotFoundError('instrument class', classCode);
      }
    }
    const moved = await this.profiles.assignToClass(code, type?.id ?? null);

    return {
      code: moved.code,
      name: moved.name,
      kind: moved.kind,
      classCode: moved.instrumentClass?.code ?? null,
      summary: moved.describe(unitFor(moved)),
    };
  }
}

/**
 * The unit a profile reads in.
 *
 * <p>A profile does not carry one: the instrument does, and the same profile
 * covers a whole class of them. The summary is for a screen, so the class name
 * is the honest answer rather than a unit picked off whichever instrument
 * happened to be first.
 */
function unitFor(profile: { instrumentClass: { code: string } | null }): string {
  return profile.instrumentClass ? `${profile.instrumentClass.code} units` : 'units';
}
