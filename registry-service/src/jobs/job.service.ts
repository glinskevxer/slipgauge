import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { NotFoundError, RuleViolationError } from '../common/errors';
import { Page, SortWhitelist, pageOf } from '../common/page';
import { Clock } from '../config/clock';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { ContractReview } from './contract-review.entity';
import { CustomerService } from './customer.service';
import type { AddJobItemDto, BookInItemDto, BookInJobDto, RepromiseJobDto } from './dto/book-in.dto';
import type { JobDeskSummary, JobSummary, JobView } from './dto/job.views';
import { JobItem, jobItem } from './job-item.entity';
import { JobMapper } from './job.mapper';
import { JobReferenceService } from './job-reference.service';
import { Job, job } from './job.entity';
import { ItemCondition, JobPriority, JobState, turnaroundFor } from './job.enums';
import { addWorkingDays } from './working-days';

const DESK_SORT = new SortWhitelist('promisedOn')
  .allow('reference')
  .allow('receivedOn')
  .allow('promisedOn')
  .allow('state')
  .allow('priority')
  .allow('customer', 'customer.name');

const OPEN_STATES: readonly JobState[] = [
  JobState.RECEIVED,
  JobState.UNDER_REVIEW,
  JobState.ACCEPTED,
  JobState.IN_PROGRESS,
];

/**
 * The job desk: booking work in, quoting a date for it, and keeping the list of
 * what is still here.
 *
 * <p>Accepting a job and moving it along live in the contract review service
 * next door, because the decision to accept is not a desk decision and putting
 * them together would make it look like one.
 */
@Injectable()
export class JobService {
  private readonly log = new Logger(JobService.name);

  constructor(
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(JobItem) private readonly items: Repository<JobItem>,
    @InjectRepository(ContractReview) private readonly reviews: Repository<ContractReview>,
    @InjectRepository(InstrumentClass) private readonly classes: Repository<InstrumentClass>,
    private readonly customers: CustomerService,
    private readonly references: JobReferenceService,
    private readonly mapper: JobMapper,
    private readonly clock: Clock,
  ) {}

  /**
   * Books a delivery in. The promise date falls out of the customer's quoted
   * turnaround and the priority, counted in working days, and the desk can move
   * it afterwards once somebody has spoken to the customer.
   */
  async bookIn(request: BookInJobDto): Promise<JobView> {
    const owner = await this.customers.byCode(request.customerCode);

    if (!owner.active) {
      throw new RuleViolationError(
        `${owner.code} is closed, reopen the account before booking work in`,
      );
    }
    if (request.receivedOn > this.clock.today()) {
      throw new RuleViolationError('a delivery cannot be booked in before it arrives');
    }

    const priority = request.priority ?? JobPriority.STANDARD;
    const reference = await this.references.next(request.receivedOn);
    const record = job(reference, owner, request.receivedOn, request.receivedBy)
      .against(request.customerOrder ?? null)
      .withInstructions(request.instructions ?? null);

    record.priority = priority;
    record.promisedOn = addWorkingDays(
      request.receivedOn,
      turnaroundFor(priority, owner.turnaroundDays),
    );
    record.items = await this.buildItems(request.items);

    const saved = await this.jobs.save(record);

    this.log.log(
      `${saved.reference} booked in for ${owner.code}, ` +
        `${record.items.length} item(s), promised ${saved.promisedOn}`,
    );
    return this.get(saved.reference);
  }

  async get(reference: string): Promise<JobView> {
    const record = await this.byReference(reference);
    const review = await this.reviews.findOne({ where: { jobId: record.id } });

    return this.mapper.toView(record, review);
  }

  async byReference(reference: string): Promise<Job> {
    const record = await this.jobs.findOne({
      where: { reference: reference.trim().toUpperCase() },
      relations: { customer: true, items: { instrumentClass: true, instrument: true } },
    });

    if (!record) {
      throw new NotFoundError('job', reference);
    }
    return record;
  }

  /**
   * The desk list. Open work first by default, because that is what the screen
   * is for, and the whole history only when somebody asks for a state.
   */
  async search(
    state: JobState | undefined,
    customerCode: string | undefined,
    page = 0,
    size = 50,
    sort?: string,
  ): Promise<Page<JobSummary>> {
    const paging = DESK_SORT.paging(page, size);
    const builder = this.jobs
      .createQueryBuilder('job')
      .innerJoinAndSelect('job.customer', 'customer')
      .skip(paging.skip)
      .take(paging.take)
      .orderBy(DESK_SORT.resolve(sort, 'job'));

    if (state) {
      builder.andWhere('job.state = :state', { state });
    } else {
      builder.andWhere('job.state in (:...states)', { states: OPEN_STATES });
    }
    if (customerCode) {
      builder.andWhere('customer.code = :code', { code: customerCode.trim().toUpperCase() });
    }

    const [rows, total] = await builder.getManyAndCount();
    const counts = await this.itemCounts(rows.map((row) => row.id));

    return pageOf(rows, total, paging.page, paging.size, (row) =>
      this.mapper.toSummary(row, counts.get(row.id) ?? 0),
    );
  }

  /**
   * How many lines each job carries. A separate grouped query rather than a
   * relation count on the paged builder, which pushes the count into the same
   * statement as the limit and gives the wrong total the moment a job has two
   * lines on it.
   */
  private async itemCounts(jobIds: readonly number[]): Promise<Map<number, number>> {
    if (jobIds.length === 0) {
      return new Map();
    }
    const rows: { job_id: string; lines: string }[] = await this.items
      .createQueryBuilder('item')
      .select('item.job_id', 'job_id')
      .addSelect('count(*)', 'lines')
      .where('item.job_id in (:...jobIds)', { jobIds: [...jobIds] })
      .groupBy('item.job_id')
      .getRawMany();

    return new Map(rows.map((row) => [Number(row.job_id), Number(row.lines)]));
  }

  /** The counts across the top of the desk, in one pass over the open work. */
  async desk(): Promise<JobDeskSummary> {
    const today = this.clock.today();
    const open = await this.jobs.find({
      where: { state: In([...OPEN_STATES, JobState.COMPLETED]) },
    });

    const stillHere = open.filter((row) => row.isOpen());

    return {
      open: stillHere.length,
      awaitingReview: stillHere.filter((row) => row.state === JobState.UNDER_REVIEW).length,
      onTheBench: stillHere.filter((row) => row.state === JobState.IN_PROGRESS).length,
      late: stillHere.filter((row) => row.promisedOn < today).length,
      dueToday: stillHere.filter((row) => row.promisedOn === today).length,
      readyToDispatch: open.filter((row) => row.state === JobState.COMPLETED).length,
    };
  }

  /**
   * Moves the promise. Kept separate from the rest of the job because it is the
   * one field a customer can change over the phone, and the reason goes into
   * the instructions where the bench will read it.
   */
  async repromise(reference: string, request: RepromiseJobDto): Promise<JobView> {
    const record = await this.byReference(reference);

    if (!record.isOpen()) {
      throw new RuleViolationError(`${record.reference} is ${record.state} and cannot be moved`);
    }
    record.promise(request.promisedOn);
    record.instructions = [record.instructions, `repromised: ${request.reason}`]
      .filter(Boolean)
      .join('\n')
      .slice(0, 1000);

    await this.jobs.save(record);
    this.log.log(`${record.reference} repromised to ${request.promisedOn}`);
    return this.get(record.reference);
  }

  /** Adds a line to a job that has not been reviewed yet. */
  async addItem(reference: string, request: AddJobItemDto): Promise<JobView> {
    const record = await this.byReference(reference);

    if (record.state !== JobState.RECEIVED) {
      throw new RuleViolationError(
        `${record.reference} is ${record.state}, a line added now would not have been reviewed`,
      );
    }
    const highest = record.items.reduce((top, item) => Math.max(top, item.lineNumber), 0);
    const [built] = await this.buildItems([request], highest + 1);

    built.job = record;
    await this.items.save(built);
    return this.get(record.reference);
  }

  private async buildItems(lines: readonly BookInItemDto[], from = 1): Promise<JobItem[]> {
    const codes = lines.map((line) => line.classCode).filter((code): code is string => Boolean(code));
    const classes = codes.length
      ? await this.classes.find({ where: { code: In([...new Set(codes)]) } })
      : [];
    const byCode = new Map(classes.map((type) => [type.code, type]));

    for (const code of new Set(codes)) {
      if (!byCode.has(code)) {
        throw new NotFoundError('instrument class', code);
      }
    }

    return lines.map((line, index) => {
      const item = jobItem(from + index, line.service, line.description)
        .identifiedAs(
          line.manufacturer ?? null,
          line.model ?? null,
          line.serialNumber ?? null,
        )
        .arrivedIn(line.condition ?? ItemCondition.SERVICEABLE, line.accessories ?? null);

      item.instrumentClass = line.classCode ? (byCode.get(line.classCode) ?? null) : null;
      item.note = line.note ?? null;
      item.rangeHigh = line.rangeHigh ?? null;
      item.toleranceStated = line.toleranceStated ?? false;
      return item;
    });
  }
}
