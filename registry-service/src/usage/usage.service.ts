import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

import { NotFoundError, RuleViolationError } from '../common/errors';
import { Page, SortWhitelist, pageOf } from '../common/page';
import { Clock } from '../config/clock';
import { Instrument } from '../instrument/instrument.entity';
import { statusIsUsable } from '../instrument/instrument.enums';
import type { LogUsageDto, UsageView } from './dto/log-usage.dto';
import { UsageRecord, usageRecord } from './usage-record.entity';

const USAGE_SORT = new SortWhitelist('usedOn')
  .allow('usedOn')
  .allow('usedBy')
  .allow('workOrder', 'work_order')
  .allow('customer');

/**
 * Records what an instrument was used on.
 *
 * <p>The only rule with teeth here is the one about status. An instrument that
 * is quarantined, at calibration or retired cannot be logged against a job,
 * because that is exactly the mistake the quarantine exists to prevent, and
 * catching it a month later during an impact assessment is far too late.
 */
@Injectable()
export class UsageService {
  private readonly log = new Logger(UsageService.name);

  constructor(
    @InjectRepository(UsageRecord) private readonly records: Repository<UsageRecord>,
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    private readonly clock: Clock,
  ) {}

  async logUse(request: LogUsageDto): Promise<UsageView> {
    const instrument = await this.byTag(request.assetTag);

    if (!statusIsUsable(instrument.status)) {
      throw new RuleViolationError(
        `${instrument.assetTag} is ${instrument.status} and must not be used to take a reading`,
      );
    }
    if (request.usedOn > this.clock.today()) {
      throw new RuleViolationError('a use cannot be recorded in the future');
    }
    if (request.usedOn < instrument.acquiredOn) {
      throw new RuleViolationError('a use cannot predate the instrument');
    }

    const record = usageRecord(instrument, request.usedOn, request.usedBy)
      .onJob(request.workOrder ?? null, request.customer ?? null, request.purpose ?? null)
      .withReadings(request.readingCount ?? 1)
      .noting(request.note ?? null);

    const saved = await this.records.save(record);

    this.log.debug(
      `${instrument.assetTag} used on ${request.workOrder ?? 'no work order'} ` +
        `by ${request.usedBy}`,
    );
    return this.toView(saved, instrument);
  }

  async forInstrument(
    assetTag: string,
    page = 0,
    size = 50,
    sort?: string,
  ): Promise<Page<UsageView>> {
    const instrument = await this.byTag(assetTag);
    const paging = USAGE_SORT.paging(page, size);

    const [rows, total] = await this.records.findAndCount({
      where: { instrument: { id: instrument.id } },
      order: { usedOn: 'DESC', id: 'DESC' },
      skip: paging.skip,
      take: paging.take,
    });

    // The sort whitelist still runs, so an unknown column is refused here as
    // it is everywhere else rather than being quietly ignored.
    USAGE_SORT.resolve(sort, 'usage');

    return pageOf(rows, total, paging.page, paging.size, (row) => this.toView(row, instrument));
  }

  async forWorkOrder(workOrder: string): Promise<UsageView[]> {
    const rows = await this.records.find({
      where: { workOrder },
      relations: { instrument: true },
      order: { usedOn: 'ASC', id: 'ASC' },
    });

    return rows.map((row) => this.toView(row, row.instrument));
  }

  /** Everything one instrument touched inside a window, both ends included. */
  async inWindow(instrumentId: number, from: string, to: string): Promise<UsageRecord[]> {
    return this.records.find({
      where: { instrument: { id: instrumentId }, usedOn: Between(from, to) },
      relations: { instrument: true },
      order: { usedOn: 'ASC', id: 'ASC' },
    });
  }

  /** How many separate jobs are caught by a window, which is what gets chased. */
  async distinctWorkOrders(instrumentId: number, from: string, to: string): Promise<number> {
    const rows: { count: string }[] = await this.records
      .createQueryBuilder('usage')
      .select('count(distinct usage.work_order)', 'count')
      .where('usage.instrument_id = :instrumentId', { instrumentId })
      .andWhere('usage.used_on between :from and :to', { from, to })
      .andWhere('usage.work_order is not null')
      .getRawMany();

    return Number(rows[0]?.count ?? 0);
  }

  private toView(record: UsageRecord, instrument: Instrument): UsageView {
    return {
      id: record.id,
      instrumentId: instrument.id,
      assetTag: instrument.assetTag,
      usedOn: record.usedOn,
      usedBy: record.usedBy,
      workOrder: record.workOrder,
      customer: record.customer,
      purpose: record.purpose,
      readingCount: record.readingCount,
      note: record.note,
      summary: record.describe(),
    };
  }

  private async byTag(assetTag: string): Promise<Instrument> {
    const instrument = await this.instruments.findOne({ where: { assetTag } });

    if (!instrument) {
      throw new NotFoundError('instrument', assetTag);
    }
    return instrument;
  }
}
