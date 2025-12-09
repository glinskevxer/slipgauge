import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { ToleranceProfile } from '../calibration/tolerance-profile.entity';
import { Clock } from '../config/clock';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { Instrument } from '../instrument/instrument.entity';
import { InstrumentStatus } from '../instrument/instrument.enums';
import type { ClassCapability } from './review/review-checker';

/** What the reference standards in one discipline can reach, right now. */
interface DisciplineCoverage {
  readonly available: boolean;
  readonly coveredTo: number | null;
}

/**
 * Reads the laboratory's own register and answers, for one class of
 * instrument, whether the work can actually be done.
 *
 * <p>Every answer here is derived. Nothing about capability is stored as a
 * standing fact, because it stops being true the moment a reference standard
 * falls due and the whole point of asking is to catch that before the job is
 * taken on rather than on the day the bench picks it up.
 */
@Injectable()
export class CapabilityService {
  constructor(
    @InjectRepository(InstrumentClass) private readonly classes: Repository<InstrumentClass>,
    @InjectRepository(ToleranceProfile) private readonly profiles: Repository<ToleranceProfile>,
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    private readonly clock: Clock,
  ) {}

  /** Capability for a set of class ids, as a lookup the checker can call. */
  async lookupFor(classIds: readonly number[]): Promise<(classId: number) => ClassCapability | undefined> {
    const snapshot = await this.snapshot(classIds);

    return (classId: number) => snapshot.get(classId);
  }

  async snapshot(classIds: readonly number[]): Promise<Map<number, ClassCapability>> {
    const wanted = [...new Set(classIds)];

    if (wanted.length === 0) {
      return new Map();
    }

    const classes = await this.classes.find({ where: { id: In(wanted) } });
    const profiled = await this.classesWithProfiles(classes.map((type) => type.id));
    const coverage = await this.coverageByDiscipline([
      ...new Set(classes.map((type) => type.discipline)),
    ]);

    return new Map(
      classes.map((type) => {
        const reach = coverage.get(type.discipline);

        return [
          type.id,
          {
            classId: type.id,
            code: type.code,
            discipline: type.discipline,
            hasToleranceProfile: profiled.has(type.id),
            referenceAvailable: reach?.available ?? false,
            accredited: type.accredited,
            methodReference: type.methodReference,
            coveredTo: reach?.coveredTo ?? null,
          },
        ];
      }),
    );
  }

  /**
   * Which of these classes a tolerance profile resolves for. A profile tied to
   * no class at all is a general one and does not count: it has to be chosen by
   * hand on the instrument, and nobody can choose it before the item exists.
   */
  private async classesWithProfiles(classIds: readonly number[]): Promise<Set<number>> {
    if (classIds.length === 0) {
      return new Set();
    }
    const rows: { class_id: string }[] = await this.profiles
      .createQueryBuilder('profile')
      .select('profile.class_id', 'class_id')
      .where('profile.class_id in (:...classIds)', { classIds: [...classIds] })
      .groupBy('profile.class_id')
      .getRawMany();

    return new Set(rows.map((row) => Number(row.class_id)));
  }

  /**
   * How far the reference standards in each discipline reach today.
   *
   * <p>Only standards that are in service and in calibration count. One that is
   * overdue is exactly the case this check exists for: the laboratory still
   * owns it, it is still in the register, and it cannot be used to certify
   * anything until it comes back.
   */
  private async coverageByDiscipline(
    disciplines: readonly string[],
  ): Promise<Map<string, DisciplineCoverage>> {
    if (disciplines.length === 0) {
      return new Map();
    }
    const today = this.clock.today();

    const rows: { discipline: string; reach: string | null; standards: string }[] =
      await this.instruments
        .createQueryBuilder('instrument')
        .innerJoin('instrument.instrumentClass', 'type')
        .select('type.discipline', 'discipline')
        .addSelect('max(instrument.range_high)', 'reach')
        .addSelect('count(*)', 'standards')
        .where('type.discipline in (:...disciplines)', { disciplines: [...disciplines] })
        .andWhere('instrument.is_reference = true')
        .andWhere('instrument.status = :status', { status: InstrumentStatus.IN_SERVICE })
        .andWhere('(instrument.next_due_on is null or instrument.next_due_on >= :today)', { today })
        .groupBy('type.discipline')
        .getRawMany();

    return new Map(
      rows.map((row) => [
        row.discipline,
        {
          available: Number(row.standards) > 0,
          coveredTo: row.reach === null ? null : Number(row.reach),
        },
      ]),
    );
  }
}
