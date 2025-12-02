import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ConflictError, NotFoundError, RuleViolationError } from '../common/errors';
import { Clock } from '../config/clock';
import { Customer, customer } from './customer.entity';
import type { CreateCustomerDto, CustomerSummary, CustomerView, UpdateCustomerDto } from './dto/customer.dto';
import { Job } from './job.entity';
import { JobState } from './job.enums';

/** One row of the counts the desk reads beside a customer. */
interface JobCountRow {
  readonly customer_id: string;
  readonly open_jobs: string;
  readonly late_jobs: string;
  readonly last_received_on: string | null;
}

/**
 * Who sends work in.
 *
 * <p>Small on purpose. The only rules with any weight are that a code is never
 * reused and a customer with open work cannot be closed, and both of them exist
 * because of the same mistake: a job whose customer has quietly become somebody
 * else is a certificate addressed to the wrong firm.
 */
@Injectable()
export class CustomerService {
  private readonly log = new Logger(CustomerService.name);

  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    private readonly clock: Clock,
  ) {}

  async create(request: CreateCustomerDto): Promise<CustomerView> {
    const code = request.code.trim().toUpperCase();
    const existing = await this.customers.findOne({ where: { code } });

    if (existing) {
      throw ConflictError.duplicate('customer', code);
    }

    const record = customer(code, request.name)
      .contactedBy(
        request.contactName ?? null,
        request.contactEmail ?? null,
        request.contactPhone ?? null,
      )
      .quoting(request.turnaroundDays ?? 10);

    record.address = request.address ?? null;
    record.accreditedRequired = request.accreditedRequired ?? false;
    record.note = request.note ?? null;

    const saved = await this.customers.save(record);
    this.log.log(`customer ${saved.code} opened`);
    return toView(saved);
  }

  async update(code: string, request: UpdateCustomerDto): Promise<CustomerView> {
    const record = await this.byCode(code);

    if (request.name !== undefined) {
      record.name = request.name.trim();
    }
    if (
      request.contactName !== undefined ||
      request.contactEmail !== undefined ||
      request.contactPhone !== undefined
    ) {
      record.contactedBy(
        request.contactName ?? record.contactName,
        request.contactEmail ?? record.contactEmail,
        request.contactPhone ?? record.contactPhone,
      );
    }
    if (request.address !== undefined) {
      record.address = request.address;
    }
    if (request.accreditedRequired !== undefined) {
      record.accreditedRequired = request.accreditedRequired;
    }
    if (request.turnaroundDays !== undefined) {
      record.quoting(request.turnaroundDays);
    }
    if (request.note !== undefined) {
      record.note = request.note;
    }
    return toView(await this.customers.save(record));
  }

  async byCode(code: string): Promise<Customer> {
    const record = await this.customers.findOne({ where: { code: code.trim().toUpperCase() } });

    if (!record) {
      throw new NotFoundError('customer', code);
    }
    return record;
  }

  async get(code: string): Promise<CustomerView> {
    return toView(await this.byCode(code));
  }

  /**
   * Everybody, with the job counts the desk sorts on. One grouped query rather
   * than a count per row: the list is opened every morning and a hundred
   * customers used to mean a hundred and one round trips.
   */
  async list(includeClosed = false): Promise<CustomerSummary[]> {
    const records = await this.customers.find({
      where: includeClosed ? {} : { active: true },
      order: { name: 'ASC' },
    });

    const counts = await this.jobCounts();

    return records.map((record) => {
      const row = counts.get(record.id);
      return {
        ...toView(record),
        openJobs: row ? Number(row.open_jobs) : 0,
        lateJobs: row ? Number(row.late_jobs) : 0,
        lastReceivedOn: row?.last_received_on ?? null,
      };
    });
  }

  /**
   * Closes a customer. Work already done for them stays readable for as long as
   * the certificates do, which is why this is a flag and not a delete.
   */
  async close(code: string): Promise<CustomerView> {
    const record = await this.byCode(code);
    const open = await this.jobs.count({
      where: OPEN_STATES.map((state) => ({ customer: { id: record.id }, state })),
    });

    if (open > 0) {
      throw new RuleViolationError(
        `${record.code} still has ${open} open job${open === 1 ? '' : 's'}, ` +
          'finish or decline them first',
      );
    }
    record.close();
    this.log.log(`customer ${record.code} closed`);
    return toView(await this.customers.save(record));
  }

  async reopen(code: string): Promise<CustomerView> {
    const record = await this.byCode(code);

    record.reopen();
    return toView(await this.customers.save(record));
  }

  private async jobCounts(): Promise<Map<number, JobCountRow>> {
    const today = this.clock.today();
    const rows: JobCountRow[] = await this.jobs
      .createQueryBuilder('job')
      .select('job.customer_id', 'customer_id')
      .addSelect(
        `count(*) filter (where job.state in (:...open))`,
        'open_jobs',
      )
      .addSelect(
        `count(*) filter (where job.state in (:...open) and job.promised_on < :today)`,
        'late_jobs',
      )
      .addSelect('max(job.received_on)', 'last_received_on')
      .setParameters({ open: OPEN_STATES, today })
      .groupBy('job.customer_id')
      .getRawMany();

    return new Map(rows.map((row) => [Number(row.customer_id), row]));
  }
}

const OPEN_STATES: readonly JobState[] = [
  JobState.RECEIVED,
  JobState.UNDER_REVIEW,
  JobState.ACCEPTED,
  JobState.IN_PROGRESS,
];

export function toView(record: Customer): CustomerView {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    contactName: record.contactName,
    contactEmail: record.contactEmail,
    contactPhone: record.contactPhone,
    address: record.address,
    accreditedRequired: record.accreditedRequired,
    turnaroundDays: record.turnaroundDays,
    active: record.active,
    note: record.note,
    reachable: record.isReachable(),
  };
}
