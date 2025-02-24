import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';

import { ConflictError, NotFoundError } from '../common/errors';
import { Page, SortWhitelist, pageOf } from '../common/page';
import { Clock } from '../config/clock';
import { AssetTagService } from './asset-tag.service';
import type { InstrumentDetail } from './dto/instrument.views';
import type { InstrumentQueryDto } from './dto/instrument-query.dto';
import type { RegisterInstrumentDto } from './dto/register-instrument.dto';
import type { UpdateInstrumentDto } from './dto/update-instrument.dto';
import { Instrument } from './instrument.entity';
import { InstrumentClass } from './instrument-class.entity';
import { InstrumentMapper } from './instrument.mapper';
import { InstrumentStatus } from './instrument.enums';
import { StorageLocation } from './storage-location.entity';
import { StorageLocationService } from './storage-location.service';

const REGISTER_SORT = new SortWhitelist('assetTag')
  .allow('assetTag')
  .allow('manufacturer')
  .allow('model')
  .allow('serialNumber')
  .allow('status')
  .allow('acquiredOn')
  .allow('classCode', 'type.code')
  .allow('discipline', 'type.discipline')
  .allow('criticality', 'type.criticality');

@Injectable()
export class InstrumentService {
  constructor(
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    @InjectRepository(InstrumentClass) private readonly classes: Repository<InstrumentClass>,
    private readonly places: StorageLocationService,
    private readonly tags: AssetTagService,
    private readonly mapper: InstrumentMapper,
    private readonly clock: Clock,
  ) {}

  async register(request: RegisterInstrumentDto): Promise<InstrumentDetail> {
    const duplicate = await this.instruments.findOne({
      where: {
        manufacturer: request.manufacturer,
        model: request.model,
        serialNumber: request.serialNumber,
      },
    });

    if (duplicate) {
      throw ConflictError.duplicate(
        'instrument',
        `${request.manufacturer} ${request.model} ${request.serialNumber}`,
      );
    }

    const type = await this.classes.findOne({ where: { code: request.classCode } });
    if (!type) {
      throw new NotFoundError('instrument class', request.classCode);
    }

    const instrument = new Instrument();
    instrument.assetTag = await this.tags.next();
    instrument.instrumentClass = type;
    instrument.manufacturer = request.manufacturer;
    instrument.model = request.model;
    instrument.serialNumber = request.serialNumber;
    instrument.unit = request.unit;
    instrument.acquiredOn = request.acquiredOn;
    instrument.status = InstrumentStatus.IN_SERVICE;
    instrument.description = request.description ?? null;
    instrument.applySpan(request.rangeLow, request.rangeHigh, request.resolution);
    instrument.markAsReference(request.referenceStandard);
    instrument.moveTo(await this.resolveLocation(request.locationCode), request.custodian ?? null);

    const saved = await this.instruments.save(instrument);
    return this.get(saved.id);
  }

  async search(query: InstrumentQueryDto): Promise<Page<ReturnType<InstrumentMapper['toSummary']>>> {
    const { skip, take, page, size } = REGISTER_SORT.paging(query.page ?? 0, query.size ?? 50);

    const builder = this.instruments
      .createQueryBuilder('instrument')
      .innerJoinAndSelect('instrument.instrumentClass', 'type')
      .leftJoinAndSelect('instrument.location', 'location')
      .leftJoinAndSelect('location.parent', 'locationParent')
      .skip(skip)
      .take(take)
      .orderBy(REGISTER_SORT.resolve(query.sort, 'instrument'));

    this.applyFilters(builder, query);

    const [rows, totalItems] = await builder.getManyAndCount();
    return pageOf(rows, totalItems, page, size, (row) => this.mapper.toSummary(row));
  }

  /**
   * Every clause is separate so each can be read on its own and so the export
   * and the recall list can reuse the same shapes. The text clause is the only
   * one that touches more than one column.
   */
  private applyFilters(
    builder: SelectQueryBuilder<Instrument>,
    query: InstrumentQueryDto,
  ): void {
    if (query.text?.trim()) {
      const needle = `%${query.text.trim().toLowerCase()}%`;
      builder.andWhere(
        new Brackets((where) => {
          where
            .where('lower(instrument.asset_tag) like :needle', { needle })
            .orWhere('lower(instrument.manufacturer) like :needle', { needle })
            .orWhere('lower(instrument.model) like :needle', { needle })
            .orWhere('lower(instrument.serial_number) like :needle', { needle })
            .orWhere('lower(coalesce(instrument.description, \'\')) like :needle', { needle });
        }),
      );
    }

    if (query.statuses?.length) {
      builder.andWhere('instrument.status in (:...statuses)', { statuses: query.statuses });
    } else if (!query.includeRetired) {
      builder.andWhere('instrument.status <> :retired', { retired: InstrumentStatus.RETIRED });
    }

    if (query.disciplines?.length) {
      builder.andWhere('type.discipline in (:...disciplines)', {
        disciplines: query.disciplines,
      });
    }
    if (query.criticalities?.length) {
      builder.andWhere('type.criticality in (:...criticalities)', {
        criticalities: query.criticalities,
      });
    }
    if (query.classCode) {
      builder.andWhere('type.code = :classCode', { classCode: query.classCode });
    }
    if (query.locationCode) {
      builder.andWhere('location.code = :locationCode', { locationCode: query.locationCode });
    }
    if (query.referenceOnly) {
      builder.andWhere('instrument.is_reference = true');
    }
    if (query.acquiredFrom) {
      builder.andWhere('instrument.acquired_on >= :from', { from: query.acquiredFrom });
    }
    if (query.acquiredTo) {
      builder.andWhere('instrument.acquired_on <= :to', { to: query.acquiredTo });
    }
  }

  async get(id: number): Promise<InstrumentDetail> {
    return this.mapper.toDetail(await this.load(id));
  }

  async getByAssetTag(assetTag: string): Promise<InstrumentDetail> {
    const instrument = await this.instruments.findOne({
      where: { assetTag },
      relations: { instrumentClass: true, location: true },
    });

    if (!instrument) {
      throw new NotFoundError('instrument', assetTag);
    }
    await this.hydrateLocation(instrument);
    return this.mapper.toDetail(instrument);
  }

  async update(id: number, request: UpdateInstrumentDto): Promise<InstrumentDetail> {
    const instrument = await this.load(id);

    instrument.description = request.description ?? null;
    instrument.applySpan(request.rangeLow, request.rangeHigh, request.resolution);
    instrument.moveTo(await this.resolveLocation(request.locationCode), request.custodian ?? null);
    instrument.markAsReference(request.referenceStandard);

    await this.instruments.save(instrument);
    return this.get(id);
  }

  async changeStatus(id: number, target: InstrumentStatus): Promise<InstrumentDetail> {
    const instrument = await this.load(id);
    instrument.transitionTo(target);
    await this.instruments.save(instrument);
    return this.get(id);
  }

  async retire(id: number, on?: string): Promise<InstrumentDetail> {
    const instrument = await this.load(id);
    instrument.retire(on ?? this.clock.today());
    await this.instruments.save(instrument);
    return this.get(id);
  }

  async load(id: number): Promise<Instrument> {
    const instrument = await this.instruments.findOne({
      where: { id },
      relations: { instrumentClass: true, location: true },
    });

    if (!instrument) {
      throw new NotFoundError('instrument', id);
    }
    await this.hydrateLocation(instrument);
    return instrument;
  }

  /**
   * The detail view prints the whole breadcrumb, and the location arrives from
   * the join with no parents on it. One query fills the chain in however deep
   * the tree happens to be.
   */
  private async hydrateLocation(instrument: Instrument): Promise<void> {
    if (instrument.location) {
      await this.places.hydrate([instrument.location]);
    }
  }

  private async resolveLocation(code: string | null | undefined): Promise<StorageLocation | null> {
    if (!code || !code.trim()) {
      return null;
    }
    return this.places.byCode(code.trim());
  }
}
