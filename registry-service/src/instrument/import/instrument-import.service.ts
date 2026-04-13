import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BadRequestError } from '../../common/errors';
import { CsvFormatError, missingHeaders, parseCsv } from '../../common/csv';
import { Clock } from '../../config/clock';
import { AssetTagService } from '../asset-tag.service';
import { InstrumentClass } from '../instrument-class.entity';
import { Instrument } from '../instrument.entity';
import { InstrumentStatus } from '../instrument.enums';
import { StorageLocation } from '../storage-location.entity';
import {
  ImportLine,
  ImportReport,
  ImportVerdict,
  REQUIRED_COLUMNS,
  checkLine,
  describeLine,
  readBoolean,
  summarise,
} from './import-report';

/**
 * Bringing a spreadsheet of instruments into the register.
 *
 * <p>Every import is a dry run first. The same walk produces the same report
 * either way, and the only difference is whether the rows are written at the
 * end, which is what makes the preview trustworthy: it is not a different code
 * path that might disagree.
 *
 * <p>A rejected line does not stop the import. Four hundred rows with two bad
 * ones should bring in three hundred and ninety eight and say which two were
 * left, because the alternative is that nothing is imported until a spreadsheet
 * is perfect and nobody ever gets there.
 */
@Injectable()
export class InstrumentImportService {
  private readonly log = new Logger(InstrumentImportService.name);

  constructor(
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    @InjectRepository(InstrumentClass) private readonly classes: Repository<InstrumentClass>,
    @InjectRepository(StorageLocation) private readonly locations: Repository<StorageLocation>,
    private readonly tags: AssetTagService,
    private readonly clock: Clock,
  ) {}

  async run(text: string, dryRun: boolean): Promise<ImportReport> {
    const parse = this.parse(text);
    const missing = missingHeaders(parse, REQUIRED_COLUMNS);

    if (missing.length > 0) {
      throw new BadRequestError(`the file is missing ${missing.join(', ')}`);
    }

    const classes = new Map(
      (await this.classes.find()).map((type) => [type.code.toUpperCase(), type]),
    );
    const places = new Map(
      (await this.locations.find()).map((place) => [place.code.toUpperCase(), place]),
    );

    const lines: ImportLine[] = [];
    const seen = new Set<string>();
    const today = this.clock.today();

    for (const record of parse.records) {
      const cells = record.cells;
      const problems = checkLine(cells);
      const classCode = (cells['classCode'] ?? '').toUpperCase();
      const type = classes.get(classCode);

      if (cells['classCode'] && !type) {
        problems.push(`there is no class called ${cells['classCode']}`);
      }
      const locationCode = (cells['locationCode'] ?? '').toUpperCase();

      if (locationCode && !places.has(locationCode)) {
        problems.push(`there is no location called ${cells['locationCode']}`);
      }
      if (cells['acquiredOn'] && cells['acquiredOn'] > today) {
        problems.push('acquiredOn is in the future');
      }

      const key = identityOf(cells);

      if (seen.has(key)) {
        problems.push('this make, model and serial appears earlier in the same file');
      }
      seen.add(key);

      if (problems.length > 0) {
        lines.push({
          line: record.line,
          verdict: ImportVerdict.REJECTED,
          describes: describeLine(cells),
          assetTag: null,
          problems,
        });
        continue;
      }

      const held = await this.instruments.findOne({
        where: {
          manufacturer: cells['manufacturer'],
          model: cells['model'],
          serialNumber: cells['serialNumber'],
        },
      });

      if (held) {
        lines.push({
          line: record.line,
          verdict: ImportVerdict.DUPLICATE,
          describes: describeLine(cells),
          assetTag: held.assetTag,
          problems: [`already in the register as ${held.assetTag}`],
        });
        continue;
      }

      const assetTag = dryRun ? null : await this.create(cells, type!, places.get(locationCode));

      lines.push({
        line: record.line,
        verdict: ImportVerdict.NEW,
        describes: describeLine(cells),
        assetTag,
        problems: [],
      });
    }

    const report = summarise(lines, dryRun);

    this.log.log(
      `${dryRun ? 'dry run' : 'import'}: ${report.created} new, ` +
        `${report.duplicates} already held, ${report.rejected} rejected`,
    );
    return report;
  }

  private parse(text: string) {
    try {
      return parseCsv(text);
    } catch (error) {
      if (error instanceof CsvFormatError) {
        throw new BadRequestError(error.message);
      }
      throw error;
    }
  }

  private async create(
    cells: Readonly<Record<string, string>>,
    type: InstrumentClass,
    location: StorageLocation | undefined,
  ): Promise<string> {
    const instrument = new Instrument();

    instrument.assetTag = await this.tags.next();
    instrument.instrumentClass = type;
    instrument.manufacturer = cells['manufacturer'];
    instrument.model = cells['model'];
    instrument.serialNumber = cells['serialNumber'];
    instrument.description = cells['description'] || null;
    instrument.unit = cells['unit'];
    instrument.acquiredOn = cells['acquiredOn'];
    instrument.status = InstrumentStatus.IN_SERVICE;
    instrument.applySpan(
      Number(cells['rangeLow']),
      Number(cells['rangeHigh']),
      Number(cells['resolution']),
    );
    instrument.markAsReference(readBoolean(cells['referenceStandard']));
    instrument.moveTo(location ?? null, cells['custodian'] || null);

    const saved = await this.instruments.save(instrument);

    return saved.assetTag;
  }
}

/** Make, model and serial together, which is what the register calls one item. */
function identityOf(cells: Readonly<Record<string, string>>): string {
  return [cells['manufacturer'], cells['model'], cells['serialNumber']]
    .map((part) => (part ?? '').toLowerCase())
    .join('|');
}
