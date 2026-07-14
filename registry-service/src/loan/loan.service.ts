import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { ConflictError, NotFoundError, RuleViolationError } from '../common/errors';
import { Clock } from '../config/clock';
import { Instrument } from '../instrument/instrument.entity';
import { InstrumentStatus } from '../instrument/instrument.enums';
import { ItemCondition } from '../jobs/job.enums';
import { NonconformitySeverity, NonconformitySource } from '../nonconformity/capa-stage';
import { NonconformityService } from '../nonconformity/nonconformity.service';
import type { IssueLoanDto, LoanView, ReturnLoanDto } from './dto/loan.dto';
import { EquipmentLoan, equipmentLoan } from './equipment-loan.entity';

/**
 * The loan book.
 *
 * <p>Issuing a loan moves the instrument to ON_LOAN and booking it back moves
 * it to IN_SERVICE, so the status is a reading of the loan rather than a second
 * fact that can disagree with it. The transitions go through the entity, which
 * refuses a loan of anything quarantined or retired without this service having
 * to remember which those are.
 */
@Injectable()
export class LoanService {
  private readonly log = new Logger(LoanService.name);

  constructor(
    @InjectRepository(EquipmentLoan) private readonly loans: Repository<EquipmentLoan>,
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    private readonly nonconformities: NonconformityService,
    private readonly clock: Clock,
  ) {}

  async issue(request: IssueLoanDto, issuedBy: string): Promise<LoanView> {
    const instrument = await this.byTag(request.assetTag);

    if (request.issuedOn > this.clock.today()) {
      throw new RuleViolationError('a loan cannot be issued before it happens');
    }
    const already = await this.loans.findOne({
      where: { instrument: { id: instrument.id }, returnedOn: IsNull() },
      relations: { instrument: true },
    });

    if (already) {
      throw new ConflictError(
        `${instrument.assetTag} is already out with ${already.borrower}, due back ` +
          `${already.dueBackOn}`,
      );
    }

    const loan = equipmentLoan(
      instrument,
      request.borrower,
      request.destination,
      request.issuedOn,
      issuedBy,
    ).due(request.dueBackOn);

    loan.purpose = request.purpose ?? null;
    loan.conditionOut = request.conditionOut ?? ItemCondition.SERVICEABLE;
    loan.note = request.note ?? null;

    // The entity refuses a transition the register does not allow, so nothing
    // here has to remember that a quarantined instrument may not go out.
    instrument.transitionTo(InstrumentStatus.ON_LOAN);
    await this.instruments.save(instrument);

    const saved = await this.loans.save(loan);

    this.log.log(
      `${instrument.assetTag} out with ${saved.borrower} to ${saved.destination}, ` +
        `due back ${saved.dueBackOn}`,
    );
    return this.toView(saved, instrument);
  }

  /**
   * Books one back in.
   *
   * <p>An instrument that comes back worse than it went out raises a
   * nonconformance on its own and is quarantined rather than returned to
   * service, because the next person to pick it up would otherwise use it.
   */
  async bookBack(id: number, request: ReturnLoanDto, receivedBy: string): Promise<LoanView> {
    const loan = await this.byId(id);
    const instrument = loan.instrument;

    loan.bookBack(request.returnedOn, receivedBy, request.conditionBack, request.note ?? null);

    const damaged = loan.cameBackWorse();

    instrument.transitionTo(
      damaged ? InstrumentStatus.QUARANTINED : InstrumentStatus.IN_SERVICE,
    );
    await this.instruments.save(instrument);

    const saved = await this.loans.save(loan);

    if (damaged) {
      const raised = await this.nonconformities.raiseFor(
        NonconformitySource.OTHER,
        `loan-${saved.id}`,
        NonconformitySeverity.MEDIUM,
        `${instrument.assetTag} came back ${saved.conditionBack?.toLowerCase()}`,
        `Out with ${saved.borrower} at ${saved.destination} from ${saved.issuedOn}. ` +
          `It went out serviceable and came back ${saved.conditionBack?.toLowerCase()}, ` +
          `so it is quarantined until somebody has looked at it.`,
      );

      this.log.warn(`${raised.reference} raised from loan ${saved.id}`);
    }
    return this.toView(saved, instrument);
  }

  async get(id: number): Promise<LoanView> {
    const loan = await this.byId(id);

    return this.toView(loan, loan.instrument);
  }

  /** Everything out, worst first, and the history when asked for it. */
  async list(includeReturned = false): Promise<LoanView[]> {
    const rows = await this.loans.find({
      relations: { instrument: true },
      order: { dueBackOn: 'ASC', id: 'ASC' },
    });

    return rows
      .filter((row) => includeReturned || row.isOut())
      .map((row) => this.toView(row, row.instrument))
      .sort((a, b) => b.lateness - a.lateness || a.dueBackOn.localeCompare(b.dueBackOn));
  }

  /** Everything one instrument has been out on, newest first. */
  async forInstrument(assetTag: string): Promise<LoanView[]> {
    const instrument = await this.byTag(assetTag);
    const rows = await this.loans.find({
      where: { instrument: { id: instrument.id } },
      relations: { instrument: true },
      order: { issuedOn: 'DESC', id: 'DESC' },
    });

    return rows.map((row) => this.toView(row, instrument));
  }

  private async byId(id: number): Promise<EquipmentLoan> {
    const loan = await this.loans.findOne({ where: { id }, relations: { instrument: true } });

    if (!loan) {
      throw new NotFoundError('loan', id);
    }
    return loan;
  }

  private async byTag(assetTag: string): Promise<Instrument> {
    const instrument = await this.instruments.findOne({ where: { assetTag } });

    if (!instrument) {
      throw new NotFoundError('instrument', assetTag);
    }
    return instrument;
  }

  private toView(loan: EquipmentLoan, instrument: Instrument): LoanView {
    const today = this.clock.today();

    return {
      id: loan.id,
      assetTag: instrument.assetTag,
      borrower: loan.borrower,
      destination: loan.destination,
      purpose: loan.purpose,
      issuedOn: loan.issuedOn,
      dueBackOn: loan.dueBackOn,
      returnedOn: loan.returnedOn,
      issuedBy: loan.issuedBy,
      receivedBy: loan.receivedBy,
      conditionOut: loan.conditionOut,
      conditionBack: loan.conditionBack,
      note: loan.note,
      out: loan.isOut(),
      lateness: loan.latenessOn(today),
      overdue: loan.isOverdueOn(today),
      cameBackWorse: loan.cameBackWorse(),
      summary: loan.describe(),
    };
  }
}
