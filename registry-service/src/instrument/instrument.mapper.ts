import { Injectable } from '@nestjs/common';

import type {
  InstrumentClassView,
  InstrumentDetail,
  InstrumentSummary,
  StorageLocationView,
} from './dto/instrument.views';
import { Instrument } from './instrument.entity';
import { InstrumentClass } from './instrument-class.entity';
import { StorageLocation } from './storage-location.entity';

/**
 * Hand written on purpose. The register is read far more often than it is
 * written, and a generated mapper kept pulling the class relation on the
 * summary path where only the code is needed.
 */
@Injectable()
export class InstrumentMapper {
  toSummary(instrument: Instrument): InstrumentSummary {
    const type = instrument.instrumentClass;

    return {
      id: instrument.id,
      assetTag: instrument.assetTag,
      manufacturer: instrument.manufacturer,
      model: instrument.model,
      serialNumber: instrument.serialNumber,
      classCode: type.code,
      discipline: type.discipline,
      criticality: type.criticality,
      status: instrument.status,
      referenceStandard: instrument.isReference,
      locationCode: instrument.location?.code ?? null,
      custodian: instrument.custodian,
      acquiredOn: instrument.acquiredOn,
    };
  }

  toDetail(instrument: Instrument): InstrumentDetail {
    const type = instrument.instrumentClass;

    return {
      ...this.toSummary(instrument),
      description: instrument.description,
      className: type.name,
      baseIntervalDays: type.baseIntervalDays,
      minIntervalDays: type.minIntervalDays,
      maxIntervalDays: type.maxIntervalDays,
      unit: instrument.unit,
      rangeLow: instrument.rangeLow,
      rangeHigh: instrument.rangeHigh,
      resolution: instrument.resolution,
      locationPath: instrument.location?.pathCodes() ?? [],
      retiredOn: instrument.retiredOn,
      createdAt: instrument.createdAt.toISOString(),
      updatedAt: instrument.updatedAt.toISOString(),
      version: instrument.rowVersion,
    };
  }

  toClassView(type: InstrumentClass): InstrumentClassView {
    return {
      id: type.id,
      code: type.code,
      name: type.name,
      discipline: type.discipline,
      criticality: type.criticality,
      baseIntervalDays: type.baseIntervalDays,
      minIntervalDays: type.minIntervalDays,
      maxIntervalDays: type.maxIntervalDays,
    };
  }

  toLocationView(location: StorageLocation): StorageLocationView {
    return {
      id: location.id,
      code: location.code,
      name: location.name,
      site: location.site,
      parentCode: location.parent?.code ?? null,
      path: location.pathCodes(),
    };
  }
}
