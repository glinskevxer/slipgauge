import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Not, Repository } from 'typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { failing } from '../calibration/conformity';
import { Competence } from '../competence/competence.entity';
import { CompetenceLevel } from '../competence/competence-level';
import { Clock } from '../config/clock';
import { EnvironmentExcursion } from '../environment/environment.entities';
import { ExcursionSeverity } from '../environment/excursion';
import { Instrument } from '../instrument/instrument.entity';
import { InstrumentStatus } from '../instrument/instrument.enums';
import { Job } from '../jobs/job.entity';
import { JobState } from '../jobs/job.enums';
import { CapaStage } from '../nonconformity/capa-stage';
import { Nonconformance } from '../nonconformity/nonconformance.entity';
import { ProficiencyResultRow, ProficiencyRound, RoundState } from '../proficiency/proficiency.entities';
import { ProficiencyOutcome } from '../proficiency/scoring';
import { AccreditationScope } from '../scope/accreditation-scope.entity';
import { ManagementReview, median, talkingPointsFor } from './management-review';

/** Anything running out inside this is worth the meeting knowing about. */
const EXPIRY_HORIZON_DAYS = 60;

/**
 * Fills the management review pack in.
 *
 * <p>Every number comes from the register rather than from a spreadsheet
 * somebody keeps, which is the point: a pack assembled by hand is a pack that
 * agrees with itself and with nothing else, and the first thing an assessor
 * does is check one of its numbers against the system.
 */
@Injectable()
export class ManagementReviewService {
  constructor(
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    @InjectRepository(CalibrationCertificate)
    private readonly certificates: Repository<CalibrationCertificate>,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(Nonconformance) private readonly nonconformances: Repository<Nonconformance>,
    @InjectRepository(ProficiencyRound) private readonly rounds: Repository<ProficiencyRound>,
    @InjectRepository(ProficiencyResultRow)
    private readonly results: Repository<ProficiencyResultRow>,
    @InjectRepository(EnvironmentExcursion)
    private readonly excursions: Repository<EnvironmentExcursion>,
    @InjectRepository(Competence) private readonly competence: Repository<Competence>,
    @InjectRepository(AccreditationScope) private readonly scope: Repository<AccreditationScope>,
    private readonly clock: Clock,
  ) {}

  async pack(from: string, to: string): Promise<ManagementReview> {
    const today = this.clock.today();
    const horizon = this.clock.daysFromToday(EXPIRY_HORIZON_DAYS);

    const [scope, capa, proficiency, resources, workload, environment] = await Promise.all([
      this.scopeInput(from, to),
      this.capaInput(from, to, today),
      this.proficiencyInput(from, to),
      this.resourceInput(today, horizon),
      this.workloadInput(from, to),
      this.environmentInput(from, to),
    ]);

    const body = {
      period: { from, to },
      preparedOn: today,
      scope,
      capa,
      proficiency,
      resources,
      workload,
      environment,
    };

    return { ...body, talkingPoints: talkingPointsFor(body) };
  }

  private async scopeInput(from: string, to: string): Promise<ManagementReview['scope']> {
    const today = this.clock.today();
    const lines = await this.scope.find();
    const live = lines.filter((line) => line.isLiveOn(today));

    const covered: string[] = [...new Set(live.map((line) => String(line.discipline)))].sort();

    // Which disciplines the laboratory actually worked in, read off the
    // certificates rather than off the class list: a class nobody has used is
    // not a gap in the schedule.
    const worked: { discipline: string }[] = await this.certificates
      .createQueryBuilder('certificate')
      .innerJoin('certificate.instrument', 'instrument')
      .innerJoin('instrument.instrumentClass', 'type')
      .select('distinct type.discipline', 'discipline')
      .where('certificate.performed_on between :from and :to', { from, to })
      .andWhere('certificate.external_lab = false')
      .getRawMany();

    return {
      liveLines: live.length,
      lapsedInPeriod: lines.filter(
        (line) => line.validTo !== null && line.validTo >= from && line.validTo <= to,
      ).length,
      disciplinesCovered: covered,
      workedButUnaccredited: worked
        .map((row) => row.discipline)
        .filter((discipline) => !covered.includes(discipline))
        .sort(),
    };
  }

  private async capaInput(
    from: string,
    to: string,
    today: string,
  ): Promise<ManagementReview['capa']> {
    const all = await this.nonconformances.find();
    const raised = all.filter((row) => row.raisedOn >= from && row.raisedOn <= to);
    const closed = all.filter(
      (row) => row.closedOn !== null && row.closedOn >= from && row.closedOn <= to,
    );
    const open = all.filter((row) => row.isOpen());

    const bySource: Record<string, number> = {};
    for (const row of raised) {
      bySource[row.source] = (bySource[row.source] ?? 0) + 1;
    }

    const days = closed
      .filter((row) => row.state === CapaStage.CLOSED)
      .map(
        (row) =>
          (Date.parse(`${row.closedOn}T00:00:00Z`) - Date.parse(`${row.raisedOn}T00:00:00Z`)) /
          86_400_000,
      );

    return {
      raised: raised.length,
      closed: closed.length,
      openAtEnd: open.length,
      overdueAtEnd: open.filter((row) => row.latenessOn(today) > 0).length,
      bySource,
      medianDaysToClose: median(days),
    };
  }

  private async proficiencyInput(
    from: string,
    to: string,
  ): Promise<ManagementReview['proficiency']> {
    const rounds = await this.rounds.find();
    const scored = rounds.filter(
      (round) =>
        round.state === RoundState.SCORED &&
        round.reportedOn !== null &&
        round.reportedOn >= from &&
        round.reportedOn <= to,
    );
    const ids = new Set(scored.map((round) => round.id));
    const lines = (await this.results.find({ relations: { round: true } })).filter((row) =>
      ids.has(row.round?.id ?? row.roundId),
    );

    return {
      roundsScored: scored.length,
      satisfactory: lines.filter((row) => row.outcome === ProficiencyOutcome.SATISFACTORY).length,
      questionable: lines.filter((row) => row.outcome === ProficiencyOutcome.QUESTIONABLE).length,
      unsatisfactory: lines.filter((row) => row.outcome === ProficiencyOutcome.UNSATISFACTORY)
        .length,
      outstanding: rounds.filter((round) => round.isOpen()).length,
    };
  }

  private async resourceInput(
    today: string,
    horizon: string,
  ): Promise<ManagementReview['resources']> {
    const held = await this.instruments.find();
    const authorisations = await this.competence.find({ where: { withdrawnAt: IsNull() } });
    const live = authorisations.filter((row) => row.isLiveOn(today));

    const approvers = new Set(
      live.filter((row) => row.level === CompetenceLevel.APPROVER).map((row) => row.discipline),
    );
    const worked = new Set(live.map((row) => row.discipline));

    return {
      instrumentsInService: held.filter((row) => row.status === InstrumentStatus.IN_SERVICE).length,
      referenceStandards: held.filter((row) => row.isReference).length,
      overdue: held.filter((row) => row.nextDueOn !== null && row.nextDueOn < today).length,
      quarantined: held.filter((row) => row.status === InstrumentStatus.QUARANTINED).length,
      peopleAuthorised: new Set(live.map((row) => row.person)).size,
      authorisationsExpiringSoon: live.filter(
        (row) => row.authorisedTo !== null && row.authorisedTo <= horizon,
      ).length,
      disciplinesWithoutAnApprover: [...worked]
        .filter((discipline) => !approvers.has(discipline))
        .sort(),
    };
  }

  private async workloadInput(from: string, to: string): Promise<ManagementReview['workload']> {
    const jobs = await this.jobs.find();
    const received = jobs.filter((row) => row.receivedOn >= from && row.receivedOn <= to);
    const dispatched = jobs.filter(
      (row) =>
        row.state === JobState.DISPATCHED &&
        row.dispatchedOn !== null &&
        row.dispatchedOn >= from &&
        row.dispatchedOn <= to,
    );

    const issued = await this.certificates.find({
      where: { issuedOn: Between(from, to) },
    });

    return {
      jobsReceived: received.length,
      jobsDispatched: dispatched.length,
      lateOnDispatch: dispatched.filter((row) => (row.completedOn ?? to) > row.promisedOn).length,
      certificatesIssued: issued.length,
      certificatesWithdrawn: (
        await this.certificates.find({ where: { withdrawnAt: Not(IsNull()) } })
      ).filter((row) => row.issuedOn >= from && row.issuedOn <= to).length,
      outOfToleranceFound: issued.filter((row) => failing(row.asFoundVerdict)).length,
    };
  }

  private async environmentInput(
    from: string,
    to: string,
  ): Promise<ManagementReview['environment']> {
    const all = await this.excursions.find({ relations: { location: true } });
    const inPeriod = all.filter((row) => {
      const day = row.startedAt.toISOString().slice(0, 10);
      return day >= from && day <= to;
    });

    const rooms = new Set(
      inPeriod
        .filter((row) => row.putsWorkInQuestion())
        .map((row) => row.location?.id)
        .filter((id): id is number => id !== undefined),
    );

    const touched =
      rooms.size === 0
        ? 0
        : await this.certificates.count({
            where: [...rooms].map((id) => ({
              performedIn: { id },
              performedOn: Between(from, to),
            })),
          });

    return {
      excursions: inPeriod.length,
      major: inPeriod.filter((row) => row.severity === ExcursionSeverity.MAJOR).length,
      unassessed: inPeriod.filter((row) => !row.isAssessed()).length,
      certificatesPutInQuestion: touched,
    };
  }
}
