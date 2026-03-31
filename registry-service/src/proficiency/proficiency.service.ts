import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ConflictError, NotFoundError, RuleViolationError } from '../common/errors';
import { Clock } from '../config/clock';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { Instrument } from '../instrument/instrument.entity';
import { NonconformitySeverity, NonconformitySource } from '../nonconformity/capa-stage';
import { NonconformityService } from '../nonconformity/nonconformity.service';
import type {
  OpenRoundDto,
  ProficiencyResultView,
  ProficiencyRoundView,
  ScoreRoundDto,
  SubmitRoundDto,
} from './dto/proficiency.dto';
import {
  ProficiencyResultRow,
  ProficiencyRound,
  RoundState,
  proficiencyRound,
} from './proficiency.entities';
import { ProficiencyOutcome, outcomeLabel, showsBias, suspendsAuthorisation } from './scoring';

const ROUND_RELATIONS = {
  instrumentClass: true,
  results: { instrument: true },
} as const;

/**
 * Proficiency testing.
 *
 * <p>The interesting part is what happens after the scheme reports. An
 * unsatisfactory line is not a number to file: it raises a nonconformance on
 * its own, and it names the person who made the measurement, because an En past
 * one is a statement about a method and the person running it.
 */
@Injectable()
export class ProficiencyService {
  private readonly log = new Logger(ProficiencyService.name);

  constructor(
    @InjectRepository(ProficiencyRound) private readonly rounds: Repository<ProficiencyRound>,
    @InjectRepository(ProficiencyResultRow)
    private readonly results: Repository<ProficiencyResultRow>,
    @InjectRepository(InstrumentClass) private readonly classes: Repository<InstrumentClass>,
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    private readonly nonconformities: NonconformityService,
    private readonly clock: Clock,
  ) {}

  async open(request: OpenRoundDto): Promise<ProficiencyRoundView> {
    const existing = await this.rounds.findOne({ where: { reference: request.reference } });

    if (existing) {
      throw ConflictError.duplicate('proficiency round', request.reference);
    }
    const record = proficiencyRound(
      request.reference,
      request.scheme,
      request.provider,
      request.discipline,
      request.measurand,
      request.unit,
      request.openedOn,
      request.closesOn,
    );

    if (request.closesOn < request.openedOn) {
      throw new RuleViolationError('a round cannot close before it opens');
    }
    record.instrumentClass = request.classCode ? await this.classOf(request.classCode) : null;
    record.note = request.note ?? null;

    const saved = await this.rounds.save(record);
    this.log.log(`proficiency round ${saved.reference} opened, closes ${saved.closesOn}`);
    return this.get(saved.reference);
  }

  /** Records what we sent back. Overwrites nothing: a round is reported once. */
  async submit(reference: string, request: SubmitRoundDto): Promise<ProficiencyRoundView> {
    const round = await this.byReference(reference);

    if (round.state !== RoundState.OPEN) {
      throw new ConflictError(`${round.reference} is ${round.state} and has been submitted`);
    }

    const seen = new Set<number>();

    for (const line of request.lines) {
      if (seen.has(line.sequenceNo)) {
        throw new RuleViolationError(`line ${line.sequenceNo} appears twice on this submission`);
      }
      seen.add(line.sequenceNo);

      const row = new ProficiencyResultRow();

      row.round = round;
      row.sequenceNo = line.sequenceNo;
      row.performedBy = line.performedBy.trim().toLowerCase();
      row.instrument = line.assetTag ? await this.instrumentOf(line.assetTag) : null;
      row.nominal = line.nominal;
      row.reported = line.reported;
      row.reportedUncertainty = line.reportedUncertainty ?? null;
      row.assigned = null;
      row.assignedUncertainty = null;
      row.standardDeviation = null;
      row.enNumber = null;
      row.zScore = null;
      row.outcome = ProficiencyOutcome.NOT_SCORED;
      row.comment = line.comment ?? null;
      const written = await this.results.save(row);

      // Kept on the loaded round as well as written. Saving the round with a
      // collection that does not know about its own new rows makes the ORM
      // detach them, and the row lands with a null round and no error anybody
      // sees until the next read.
      round.results = [...(round.results ?? []), written];
    }

    round.moveTo(RoundState.SUBMITTED, this.clock.today());
    await this.rounds.save(round);
    return this.get(round.reference);
  }

  /**
   * Takes the scheme's report and scores every line.
   *
   * <p>An unsatisfactory line raises one nonconformance for the round rather
   * than one per line, because a round that failed at four points failed once.
   * The severity follows the En rule: a failed En is a high severity finding.
   */
  async score(reference: string, request: ScoreRoundDto): Promise<ProficiencyRoundView> {
    const round = await this.byReference(reference);

    if (round.state !== RoundState.SUBMITTED) {
      throw new ConflictError(
        `${round.reference} is ${round.state}, only a submitted round can be scored`,
      );
    }

    for (const line of request.lines) {
      const row = round.results.find((held) => held.sequenceNo === line.sequenceNo);

      if (!row) {
        throw new NotFoundError('proficiency line', line.sequenceNo);
      }
      row.score(
        line.assigned,
        line.assignedUncertainty ?? null,
        line.standardDeviation ?? null,
      );
      await this.results.save(row);
    }

    round.moveTo(RoundState.SCORED, request.reportedOn ?? this.clock.today());
    await this.rounds.save(round);
    await this.reactTo(round);
    return this.get(round.reference);
  }

  async withdraw(reference: string, reason: string): Promise<ProficiencyRoundView> {
    const round = await this.byReference(reference);

    round.moveTo(RoundState.WITHDRAWN, this.clock.today());
    round.note = [round.note, `withdrawn: ${reason}`].filter(Boolean).join('\n');
    await this.rounds.save(round);
    return this.get(round.reference);
  }

  async get(reference: string): Promise<ProficiencyRoundView> {
    return this.toView(await this.byReference(reference));
  }

  async list(state?: RoundState): Promise<ProficiencyRoundView[]> {
    const rows = await this.rounds.find({
      relations: ROUND_RELATIONS,
      order: { closesOn: 'DESC', id: 'DESC' },
    });

    return rows.filter((row) => !state || row.state === state).map((row) => this.toView(row));
  }

  /** Everything one person has been scored on, newest first. */
  async forPerson(person: string): Promise<ProficiencyResultView[]> {
    const rows = await this.results.find({
      where: { performedBy: person.trim().toLowerCase() },
      relations: { instrument: true, round: true },
      order: { id: 'DESC' },
    });

    return rows.map((row) => toResultView(row));
  }

  /**
   * True when somebody's last three results all sat on the same side of the
   * assigned value. Read by the competence screen, because a bias that never
   * fails a single round is exactly what a matrix of pass marks hides.
   */
  async showsBias(person: string): Promise<boolean> {
    const rows = await this.results.find({
      where: { performedBy: person.trim().toLowerCase() },
      order: { id: 'ASC' },
    });

    return showsBias(rows.filter((row) => row.isScored()).map((row) => row.toScorable()));
  }

  private async reactTo(round: ProficiencyRound): Promise<void> {
    const failed = round.results.filter(
      (row) => row.outcome === ProficiencyOutcome.UNSATISFACTORY,
    );

    if (failed.length === 0) {
      return;
    }
    const people = [...new Set(failed.map((row) => row.performedBy))];
    const suspended = failed.filter((row) => suspendsAuthorisation(row.toScorable()));

    const raised = await this.nonconformities.raiseFor(
      NonconformitySource.PROFICIENCY,
      round.reference,
      suspended.length > 0 ? NonconformitySeverity.HIGH : NonconformitySeverity.MEDIUM,
      `${round.reference} scored ${outcomeLabel(ProficiencyOutcome.UNSATISFACTORY)}`,
      `${failed.length} line(s) in ${round.scheme} came back unsatisfactory. ` +
        `Reported by ${people.join(', ')}. ` +
        (suspended.length > 0
          ? 'At least one En number exceeded one, so the stated uncertainty is in question ' +
            'as well as the value.'
          : 'The En numbers held, so this is a question about the value rather than the ' +
            'uncertainty claim.'),
    );

    this.log.warn(`${raised.reference} raised from proficiency round ${round.reference}`);
  }

  private async byReference(reference: string): Promise<ProficiencyRound> {
    const round = await this.rounds.findOne({
      where: { reference: reference.trim() },
      relations: ROUND_RELATIONS,
    });

    if (!round) {
      throw new NotFoundError('proficiency round', reference);
    }
    return round;
  }

  private async classOf(code: string): Promise<InstrumentClass> {
    const type = await this.classes.findOne({ where: { code } });

    if (!type) {
      throw new NotFoundError('instrument class', code);
    }
    return type;
  }

  private async instrumentOf(assetTag: string): Promise<Instrument> {
    const instrument = await this.instruments.findOne({ where: { assetTag } });

    if (!instrument) {
      throw new NotFoundError('instrument', assetTag);
    }
    return instrument;
  }

  private toView(round: ProficiencyRound): ProficiencyRoundView {
    return {
      id: round.id,
      reference: round.reference,
      scheme: round.scheme,
      provider: round.provider,
      discipline: round.discipline,
      classCode: round.instrumentClass?.code ?? null,
      measurand: round.measurand,
      unit: round.unit,
      openedOn: round.openedOn,
      closesOn: round.closesOn,
      reportedOn: round.reportedOn,
      state: round.state,
      note: round.note,
      results: [...(round.results ?? [])]
        .sort((a, b) => a.sequenceNo - b.sequenceNo)
        .map((row) => toResultView(row)),
      outcome: round.worstOutcome(),
      open: round.isOpen(),
      overdue: round.isOverdueOn(this.clock.today()),
    };
  }
}

export function toResultView(row: ProficiencyResultRow): ProficiencyResultView {
  return {
    id: row.id,
    sequenceNo: row.sequenceNo,
    performedBy: row.performedBy,
    assetTag: row.instrument?.assetTag ?? null,
    nominal: row.nominal,
    reported: row.reported,
    reportedUncertainty: row.reportedUncertainty,
    assigned: row.assigned,
    assignedUncertainty: row.assignedUncertainty,
    standardDeviation: row.standardDeviation,
    enNumber: row.enNumber,
    zScore: row.zScore,
    outcome: row.outcome,
    comment: row.comment,
  };
}
