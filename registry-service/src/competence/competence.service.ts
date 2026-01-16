import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { ConflictError, NotFoundError, RuleViolationError } from '../common/errors';
import { Clock } from '../config/clock';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { ALL_DISCIPLINES, Discipline } from '../instrument/instrument.enums';
import { calendarDaysBetween } from '../jobs/working-days';
import {
  AuthorisationDecision,
  AuthorisationRequest,
  decide,
  expiringWithin,
  levelOn,
} from './authorisation';
import { CompetenceLevel } from './competence-level';
import { Competence, competence } from './competence.entity';
import type {
  CompetenceCell,
  CompetenceMatrix,
  CompetenceView,
  GrantCompetenceDto,
  WithdrawCompetenceDto,
} from './dto/grant-competence.dto';

/**
 * The authorisation register.
 *
 * <p>Reads go through here and nowhere else. Every caller that asks "may this
 * person do this" gets the same answer from the same rules, which is the only
 * way the answer on the certificate screen matches the answer the service gives
 * when the certificate is actually filed.
 */
@Injectable()
export class CompetenceService {
  private readonly log = new Logger(CompetenceService.name);

  constructor(
    @InjectRepository(Competence) private readonly records: Repository<Competence>,
    @InjectRepository(InstrumentClass) private readonly classes: Repository<InstrumentClass>,
    private readonly clock: Clock,
  ) {}

  async grant(request: GrantCompetenceDto, grantedBy: string): Promise<CompetenceView> {
    const person = request.person.trim().toLowerCase();
    const type = request.classCode ? await this.classOf(request.classCode) : null;

    const clash = await this.records.findOne({
      where: {
        person,
        discipline: request.discipline,
        level: request.level,
        instrumentClass: type ? { id: type.id } : IsNull(),
        withdrawnAt: IsNull(),
      },
      relations: { instrumentClass: true },
    });

    if (clash) {
      throw new ConflictError(
        `${person} already holds a live ${request.level.toLowerCase()} authorisation for ` +
          `${request.discipline.toLowerCase()}, withdraw it before granting another`,
      );
    }

    const record = competence(
      person,
      request.discipline,
      request.level,
      grantedBy,
      request.authorisedFrom,
    )
      .running(request.authorisedFrom, request.authorisedTo ?? null)
      .over(request.rangeLow ?? null, request.rangeHigh ?? null);

    record.instrumentClass = type;
    record.evidence = request.evidence ?? null;

    const saved = await this.records.save(record);
    this.log.log(`${person} granted ${request.level} for ${request.discipline} by ${grantedBy}`);
    return this.toView(saved);
  }

  async withdraw(id: number, request: WithdrawCompetenceDto): Promise<CompetenceView> {
    const record = await this.byId(id);

    record.withdraw(request.reason, this.clock.now());
    this.log.warn(`${record.person} lost ${record.level} for ${record.discipline}`);
    return this.toView(await this.records.save(record));
  }

  async byId(id: number): Promise<Competence> {
    const record = await this.records.findOne({
      where: { id },
      relations: { instrumentClass: true },
    });

    if (!record) {
      throw new NotFoundError('authorisation', id);
    }
    return record;
  }

  /** Everything one person holds, withdrawn rows last. */
  async forPerson(person: string, includeWithdrawn = false): Promise<CompetenceView[]> {
    const rows = await this.records.find({
      where: { person: person.trim().toLowerCase() },
      relations: { instrumentClass: true },
      order: { discipline: 'ASC', level: 'DESC', authorisedFrom: 'DESC' },
    });

    return rows
      .filter((row) => includeWithdrawn || !row.isWithdrawn())
      .map((row) => this.toView(row));
  }

  /** Everybody authorised in a discipline today. */
  async forDiscipline(discipline: Discipline): Promise<CompetenceView[]> {
    const today = this.clock.today();
    const rows = await this.records.find({
      where: { discipline, withdrawnAt: IsNull() },
      relations: { instrumentClass: true },
      order: { person: 'ASC' },
    });

    return rows.filter((row) => row.isLiveOn(today)).map((row) => this.toView(row));
  }

  /**
   * The matrix the quality manager reads: everybody down the side, every
   * discipline across the top, and the highest level each of them holds.
   */
  async matrix(): Promise<CompetenceMatrix> {
    const today = this.clock.today();
    const rows = await this.records.find({
      where: { withdrawnAt: IsNull() },
      relations: { instrumentClass: true },
    });

    const people = [...new Set(rows.map((row) => row.person))].sort();
    const cells: CompetenceCell[] = [];

    for (const person of people) {
      for (const discipline of ALL_DISCIPLINES) {
        const held = rows
          .filter((row) => row.person === person && row.discipline === discipline)
          .map((row) => row.toAuthorisation());

        if (held.length === 0) {
          continue;
        }
        // Class id zero matches only the discipline wide grants, which is what
        // the matrix is about: it is a summary, not a permission check.
        const level = levelOn(held, person, discipline, held[0].classId ?? 0, today);
        const expiries = held
          .map((row) => row.authorisedTo)
          .filter((date): date is string => date !== null)
          .sort();

        cells.push({
          person,
          discipline,
          level,
          expiresOn: expiries[0] ?? null,
          grants: held.length,
        });
      }
    }
    return { people, disciplines: ALL_DISCIPLINES, cells };
  }

  /** What runs out inside a window, soonest first. */
  async expiring(withinDays = 60): Promise<CompetenceView[]> {
    const today = this.clock.today();
    const horizon = this.clock.daysFromToday(Math.max(1, withinDays));

    const rows = await this.records.find({
      where: { withdrawnAt: IsNull() },
      relations: { instrumentClass: true },
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    const expiring = expiringWithin(
      rows.map((row) => row.toAuthorisation()),
      today,
      horizon,
    );

    return expiring
      .map((row) => byId.get(row.id))
      .filter((row): row is Competence => row !== undefined)
      .map((row) => this.toView(row));
  }

  /**
   * The decision. Every caller asking whether somebody may do something comes
   * here, and gets the reason as well as the answer.
   */
  async decide(request: AuthorisationRequest): Promise<AuthorisationDecision> {
    const rows = await this.records.find({
      where: {
        person: request.person.trim().toLowerCase(),
        discipline: request.discipline as Discipline,
      },
      relations: { instrumentClass: true },
    });

    return decide(
      rows.map((row) => row.toAuthorisation()),
      { ...request, person: request.person.trim().toLowerCase() },
    );
  }

  /** The same decision, as a refusal the caller does not have to shape. */
  async require(request: AuthorisationRequest): Promise<void> {
    const decision = await this.decide(request);

    if (!decision.allowed) {
      throw new RuleViolationError(decision.detail)
        .with('person', request.person)
        .with('discipline', request.discipline)
        .with('reason', decision.reason);
    }
  }

  private async classOf(code: string): Promise<InstrumentClass> {
    const type = await this.classes.findOne({ where: { code } });

    if (!type) {
      throw new NotFoundError('instrument class', code);
    }
    return type;
  }

  private toView(record: Competence): CompetenceView {
    const today = this.clock.today();

    return {
      id: record.id,
      person: record.person,
      discipline: record.discipline,
      classCode: record.instrumentClass?.code ?? null,
      className: record.instrumentClass?.name ?? null,
      level: record.level,
      rangeLow: record.rangeLow,
      rangeHigh: record.rangeHigh,
      authorisedFrom: record.authorisedFrom,
      authorisedTo: record.authorisedTo,
      grantedBy: record.grantedBy,
      evidence: record.evidence,
      withdrawn: record.isWithdrawn(),
      withdrawnReason: record.withdrawnReason,
      live: record.isLiveOn(today),
      daysRemaining:
        record.authorisedTo === null ? null : calendarDaysBetween(today, record.authorisedTo),
    };
  }
}

export { CompetenceLevel };
