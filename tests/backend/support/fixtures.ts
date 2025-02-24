import { DataSource } from 'typeorm';

import { Instrument } from '@registry/instrument/instrument.entity';
import { InstrumentClass } from '@registry/instrument/instrument-class.entity';
import { InstrumentStatus } from '@registry/instrument/instrument.enums';
import { StorageLocation } from '@registry/instrument/storage-location.entity';

/**
 * Builds instruments the way goods inwards would, through the real entities.
 * Tests that need an instrument to hang a certificate off come here rather
 * than inserting rows, so a schema change breaks the fixture once instead of
 * breaking twenty tests separately.
 */
export class RegisterFixtures {
  constructor(private readonly dataSource: DataSource) {}

  micrometer(assetTag: string): Promise<Instrument> {
    return this.save(assetTag, 'MIC-EXT', 'Mitutoyo', '103-137', 'mm', 0, 25, 0.001, 'HARLOW-DIM');
  }

  async gaugeBlockSet(assetTag: string): Promise<Instrument> {
    const set = await this.save(
      assetTag, 'GB-SET', 'Koba', 'BM1-88-1', 'mm', 0.5, 100, 0.00001, 'HARLOW-DIM',
    );
    set.markAsReference(true);
    return this.dataSource.getRepository(Instrument).save(set);
  }

  multimeter(assetTag: string): Promise<Instrument> {
    return this.save(
      assetTag, 'DMM-BENCH', 'Keysight', '34465A', 'V', -1000, 1000, 0.000001, 'HARLOW-ELEC',
    );
  }

  balance(assetTag: string): Promise<Instrument> {
    return this.save(
      assetTag, 'BAL-ANA', 'Sartorius', 'Cubis II', 'g', 0, 220, 0.0001, 'HARLOW-MASS',
    );
  }

  async save(
    assetTag: string,
    classCode: string,
    manufacturer: string,
    model: string,
    unit: string,
    low: number,
    high: number,
    resolution: number,
    locationCode?: string,
  ): Promise<Instrument> {
    const type = await this.dataSource
      .getRepository(InstrumentClass)
      .findOneByOrFail({ code: classCode });

    const instrument = new Instrument();
    instrument.assetTag = assetTag;
    instrument.instrumentClass = type;
    instrument.manufacturer = manufacturer;
    instrument.model = model;
    instrument.serialNumber = assetTag.replace('SG-', 'SN-');
    instrument.unit = unit;
    instrument.acquiredOn = '2021-03-01';
    instrument.status = InstrumentStatus.IN_SERVICE;
    instrument.applySpan(low, high, resolution);

    if (locationCode) {
      instrument.moveTo(
        await this.dataSource
          .getRepository(StorageLocation)
          .findOne({ where: { code: locationCode }, relations: { parent: { parent: true } } }),
        'A Technician',
      );
    }

    return this.dataSource.getRepository(Instrument).save(instrument);
  }
}
