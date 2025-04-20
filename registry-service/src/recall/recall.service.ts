import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';

import { Clock } from '../config/clock';
import { Instrument } from '../instrument/instrument.entity';
import { InstrumentStatus } from '../instrument/instrument.enums';
import { IntervalDecision } from '../interval/interval-decision.entity';
import {
  RecallEntry,
  RecallStanding,
  StandingCounts,
  countByStanding,
  daysBetween,
  needsChasing,
  standingOf,
} from './recall-standing';

/** Relations an entry needs to render without a second query per row. */
const ENTRY_RELATIONS = { instrumentClass: true, location: true } as const;

/**
 * Reads the recall position off the register.
 *
 * <p>Nothing here recomputes an interval. The interval service is the only
 * writer of interval and due date, and this service reads what it wrote, which
 * is what keeps the board a single index scan rather than a replay per row.
 */
@Injectable()
export class RecallService {
  constructor(
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    @InjectRepository(IntervalDecision)
    private readonly decisions: Repository<IntervalDecision>,
    private readonly clock: Clock,
  ) {}

  /** Everything falling due between now and the horizon, soonest first. */
  async board(horizonDays = 60): Promise<RecallEntry[]> {
    const today = this.clock.today();
    const through = this.clock.daysFromToday(Math.max(0, horizonDays));

    const due = await this.instruments.find({
      where: {
        nextDueOn: LessThanOrEqual(through),
        status: Not(InstrumentStatus.RETIRED),
      },
      relations: ENTRY_RELATIONS,
      order: { nextDueOn: 'ASC', assetTag: 'ASC' },
    });

    return this.toEntries(due, today);
  }

  /** What the weekly chase list is, which is overdue plus due in seven days. */
  async chaseList(): Promise<RecallEntry[]> {
    const board = await this.board(7);

    return board.filter((entry) => needsChasing(entry.standing));
  }

  /** In service instruments nobody has ever scheduled a calibration for. */
  async unscheduled(): Promise<RecallEntry[]> {
    const today = this.clock.today();

    const found = await this.instruments.find({
      where: { nextDueOn: IsNull(), status: Not(InstrumentStatus.RETIRED) },
      relations: ENTRY_RELATIONS,
      order: { assetTag: 'ASC' },
    });

    return this.toEntries(found, today);
  }

  async overdueCount(): Promise<number> {
    const today = this.clock.today();

    return this.instruments.count({
      where: {
        nextDueOn: LessThanOrEqual(this.previousDay(today)),
        status: Not(InstrumentStatus.RETIRED),
      },
    });
  }

  async summary(horizonDays = 60): Promise<{
    horizonDays: number;
    overdue: number;
    unscheduled: number;
    byStanding: StandingCounts;
  }> {
    const [board, overdue, unscheduled] = await Promise.all([
      this.board(horizonDays),
      this.overdueCount(),
      this.unscheduled(),
    ]);

    return {
      horizonDays,
      overdue,
      unscheduled: unscheduled.length,
      byStanding: countByStanding(board),
    };
  }

  /**
   * The basis of every live decision in one query. The board used to fetch one
   * per row, which on a register of four thousand instruments was four
   * thousand round trips to colour a column.
   */
  private async basesFor(instrumentIds: readonly number[]): Promise<Map<number, string>> {
    if (instrumentIds.length === 0) {
      return new Map();
    }

    // Read as raw rows on purpose. The relation id is what this needs and
    // hydrating the decision entities to get at it would load the instrument
    // back again for every row on the board.
    const live: { instrument_id: number; basis: string }[] = await this.decisions
      .createQueryBuilder('decision')
      .select('decision.instrument_id', 'instrument_id')
      .addSelect('decision.basis', 'basis')
      .where('decision.superseded = false')
      .andWhere('decision.instrument_id in (:...ids)', { ids: [...instrumentIds] })
      .getRawMany();

    return new Map(live.map((row) => [Number(row.instrument_id), row.basis]));
  }

  private async toEntries(
    instruments: readonly Instrument[],
    today: string,
  ): Promise<RecallEntry[]> {
    const bases = await this.basesFor(instruments.map((instrument) => instrument.id));

    return instruments.map((instrument) => this.toEntry(instrument, today, bases));
  }

  private toEntry(
    instrument: Instrument,
    today: string,
    bases: Map<number, string>,
  ): RecallEntry {
    const due = instrument.nextDueOn;

    return {
      instrumentId: instrument.id,
      assetTag: instrument.assetTag,
      manufacturer: instrument.manufacturer,
      model: instrument.model,
      classCode: instrument.instrumentClass.code,
      criticality: instrument.instrumentClass.criticality,
      status: instrument.status,
      referenceStandard: instrument.isReference,
      locationCode: instrument.location?.code ?? null,
      custodian: instrument.custodian,
      lastCalibratedOn: instrument.lastCalibratedOn,
      intervalDays: instrument.intervalDays,
      nextDueOn: due,
      daysUntilDue: due === null ? null : daysBetween(today, due),
      standing: standingOf(due, today),
      intervalBasis: (bases.get(instrument.id) as RecallEntry['intervalBasis']) ?? null,
    };
  }

  private previousDay(today: string): string {
    const date = new Date(`${today}T00:00:00Z`);

    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }
}

export { RecallStanding };
