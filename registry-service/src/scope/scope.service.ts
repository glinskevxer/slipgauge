import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { NotFoundError } from '../common/errors';
import { Clock } from '../config/clock';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { Discipline } from '../instrument/instrument.enums';
import { AccreditationScope, scopeLine } from './accreditation-scope.entity';
import type { ScopeLineView, SetScopeLineDto } from './dto/scope.dto';

/** What the schedule says about one class, reduced to the two facts asked. */
export interface ScopeCover {
  /** A live line names this class at all. */
  readonly accredited: boolean;
  /** The top of the highest live line for it, null when there is none. */
  readonly coveredTo: number | null;
}

/**
 * The schedule of accreditation.
 *
 * <p>Everything that used to ask an instrument class whether it was accredited
 * asks here instead. The flag it replaced could not answer the question the
 * assessor actually asks, which is not whether a class is on the schedule but
 * whether this measurement, at this value, on this date, is.
 */
@Injectable()
export class ScopeService {
  private readonly log = new Logger(ScopeService.name);

  constructor(
    @InjectRepository(AccreditationScope) private readonly lines: Repository<AccreditationScope>,
    @InjectRepository(InstrumentClass) private readonly classes: Repository<InstrumentClass>,
    private readonly clock: Clock,
  ) {}

  async add(request: SetScopeLineDto): Promise<ScopeLineView> {
    const type = request.classCode ? await this.classOf(request.classCode) : null;

    const line = scopeLine(
      request.scheduleRef,
      request.discipline,
      request.measurand,
      request.unit,
      request.validFrom,
    )
      .over(request.rangeLow, request.rangeHigh)
      .running(request.validFrom, request.validTo ?? null)
      .claiming(request.cmcAbsolute ?? null, request.cmcPpm ?? null);

    line.instrumentClass = type;
    line.note = request.note ?? null;

    const saved = await this.lines.save(line);
    this.log.log(`schedule line ${saved.scheduleRef} added: ${saved.describe()}`);
    return this.toView(saved);
  }

  /** Withdraws a line by lapsing it, never by deleting it. */
  async lapse(id: number, on?: string): Promise<ScopeLineView> {
    const line = await this.lines.findOne({ where: { id }, relations: { instrumentClass: true } });

    if (!line) {
      throw new NotFoundError('schedule line', id);
    }
    line.running(line.validFrom, on ?? this.clock.today());
    return this.toView(await this.lines.save(line));
  }

  async list(discipline?: Discipline, includeLapsed = false): Promise<ScopeLineView[]> {
    const today = this.clock.today();
    const rows = await this.lines.find({
      relations: { instrumentClass: true },
      order: { discipline: 'ASC', rangeLow: 'ASC' },
    });

    return rows
      .filter((row) => !discipline || row.discipline === discipline)
      .filter((row) => includeLapsed || row.isLiveOn(today))
      .map((row) => this.toView(row));
  }

  /**
   * What the schedule covers for a set of classes today.
   *
   * <p>One query for the whole set. The contract review checker asks about
   * every line on a job, and a query per line turned a twelve item job into
   * thirteen round trips before anybody had answered a single clause.
   */
  async coverFor(classIds: readonly number[]): Promise<Map<number, ScopeCover>> {
    const wanted = [...new Set(classIds)];
    const cover = new Map<number, ScopeCover>(
      wanted.map((id) => [id, { accredited: false, coveredTo: null }]),
    );

    if (wanted.length === 0) {
      return cover;
    }
    const today = this.clock.today();
    const rows = await this.lines.find({ where: { instrumentClass: { id: In(wanted) } } });

    for (const row of rows) {
      const classId = row.classId ?? row.instrumentClass?.id ?? null;

      if (classId === null || !row.isLiveOn(today)) {
        continue;
      }
      const held = cover.get(classId) ?? { accredited: false, coveredTo: null };

      cover.set(classId, {
        accredited: true,
        coveredTo: Math.max(held.coveredTo ?? Number.NEGATIVE_INFINITY, row.rangeHigh),
      });
    }
    return cover;
  }

  /**
   * The line that covers one measurement, or null. The narrowest range wins,
   * because a schedule that grants zero to a thousand and also zero to ten
   * means the tighter capability applies where it applies.
   */
  async lineFor(
    classId: number,
    value: number,
    on?: string,
  ): Promise<AccreditationScope | null> {
    const day = on ?? this.clock.today();
    const rows = await this.lines.find({
      where: { instrumentClass: { id: classId } },
      relations: { instrumentClass: true },
    });

    const covering = rows.filter((row) => row.isLiveOn(day) && row.covers(value));

    if (covering.length === 0) {
      return null;
    }
    return covering.reduce((narrowest, row) =>
      row.rangeHigh - row.rangeLow < narrowest.rangeHigh - narrowest.rangeLow ? row : narrowest,
    );
  }

  private async classOf(code: string): Promise<InstrumentClass> {
    const type = await this.classes.findOne({ where: { code } });

    if (!type) {
      throw new NotFoundError('instrument class', code);
    }
    return type;
  }

  private toView(line: AccreditationScope): ScopeLineView {
    return {
      id: line.id,
      scheduleRef: line.scheduleRef,
      discipline: line.discipline,
      classCode: line.instrumentClass?.code ?? null,
      measurand: line.measurand,
      unit: line.unit,
      rangeLow: line.rangeLow,
      rangeHigh: line.rangeHigh,
      cmcAbsolute: line.cmcAbsolute,
      cmcPpm: line.cmcPpm,
      validFrom: line.validFrom,
      validTo: line.validTo,
      note: line.note,
      live: line.isLiveOn(this.clock.today()),
      summary: line.describe(),
    };
  }
}
