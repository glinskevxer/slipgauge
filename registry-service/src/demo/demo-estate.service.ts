import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { hashSync } from 'bcryptjs';

import { AcceptancePolicy } from '../calibration/conformity';
import { CompetenceLevel } from '../competence/competence-level';
import { Competence, competence } from '../competence/competence.entity';
import { CalibrationService } from '../calibration/calibration.service';
import type { RecordCalibrationDto, StandardInput } from '../calibration/dto/record-calibration.dto';
import { Instrument } from '../instrument/instrument.entity';
import { Discipline } from '../instrument/instrument.enums';
import { InstrumentService } from '../instrument/instrument.service';
import { AppUser } from '../security/app-user.entity';
import { Role } from '../security/role';
import { StandardRole } from '../traceability/standard-role';
import { UsageRecord, usageRecord } from '../usage/usage-record.entity';
import { DeterministicRandom, plusDays, plusYears } from './deterministic-random';

const LAB = 'Slipgauge Metrology';
const DEMO_PASSWORD = 'demo-password-not-for-real-use';

/** Fixed, so two people running the demo see the same laboratory. */
const DEMO_SEED = 20_250_113;

/**
 * The demo files three years of back dated history, so the authorisations have
 * to cover that history rather than starting today. A laboratory where nobody
 * was authorised until this morning could not have issued any of it.
 */
const AUTHORISED_FROM = '2022-01-10';
const AUTHORISED_TO = '2027-01-08';

interface Person {
  readonly username: string;
  readonly name: string;
  readonly roles: readonly Role[];
  /** The disciplines they are authorised in, which is not the same as a role. */
  readonly authorised: readonly Discipline[];
  readonly level: CompetenceLevel | null;
}

interface Kit {
  readonly classCode: string;
  readonly maker: string;
  readonly model: string;
  readonly unit: string;
  readonly low: number;
  readonly high: number;
  readonly resolution: number;
  readonly room: string;
}

const STAFF: readonly Person[] = [
  {
    username: 'r.okonjo',
    name: 'Rachel Okonjo',
    roles: [Role.TECHNICIAN],
    authorised: [Discipline.DIMENSIONAL],
    level: CompetenceLevel.AUTHORISED,
  },
  {
    username: 'd.ferreira',
    name: 'Daniel Ferreira',
    roles: [Role.TECHNICIAN],
    authorised: [Discipline.DIMENSIONAL, Discipline.MASS],
    level: CompetenceLevel.AUTHORISED,
  },
  {
    username: 'h.whitcombe',
    name: 'Helen Whitcombe',
    roles: [Role.METROLOGIST, Role.QUALITY_MANAGER],
    authorised: [Discipline.DIMENSIONAL, Discipline.MASS, Discipline.TEMPERATURE],
    level: CompetenceLevel.APPROVER,
  },
  // The auditor reads. Giving them an authorisation would be the one thing a
  // demo must not teach anybody to do.
  { username: 'a.mbeki', name: 'Ayanda Mbeki', roles: [Role.AUDITOR], authorised: [], level: null },
];

const BENCH: readonly Kit[] = [
  { classCode: 'MIC-EXT', maker: 'Mitutoyo', model: '103-137', unit: 'mm', low: 0, high: 25, resolution: 0.001, room: 'HARLOW-DIM' },
  { classCode: 'MIC-EXT', maker: 'Mitutoyo', model: '103-138', unit: 'mm', low: 25, high: 50, resolution: 0.001, room: 'HARLOW-DIM' },
  { classCode: 'CAL-VER', maker: 'Tesa', model: '00530001', unit: 'mm', low: 0, high: 200, resolution: 0.02, room: 'CREWE-TOOL' },
  { classCode: 'CAL-DIG', maker: 'Mahr', model: '16 EWR', unit: 'mm', low: 0, high: 150, resolution: 0.01, room: 'CREWE-TOOL' },
  { classCode: 'DTI', maker: 'Baty', model: 'FM 200', unit: 'mm', low: 0, high: 0.8, resolution: 0.001, room: 'HARLOW-DIM' },
];

const CUSTOMERS = ['Fenland Turbines', 'Brightside Forge', 'Kestrel Aerospace'];

/**
 * Fills an empty database with a laboratory that looks like one.
 *
 * <p>It builds the estate through the same services the console uses rather
 * than inserting rows, which means the intervals, verdicts and impact
 * assessments it produces are the ones the engine would really have produced.
 *
 * <p>It refuses to run against a register that already holds anything, so it
 * can never touch a real deployment even if the switch is left on by mistake.
 */
@Injectable()
export class DemoEstateService {
  private readonly log = new Logger(DemoEstateService.name);

  /**
   * Reseeded at the start of every load rather than once per instance. The
   * seed is what makes the laboratory the same for everybody, and a service
   * that has already built one estate would otherwise build a different one
   * the second time it is asked.
   */
  private random = new DeterministicRandom(DEMO_SEED);

  constructor(
    @InjectRepository(Instrument) private readonly register: Repository<Instrument>,
    @InjectRepository(UsageRecord) private readonly usage: Repository<UsageRecord>,
    @InjectRepository(AppUser) private readonly users: Repository<AppUser>,
    @InjectRepository(Competence) private readonly competence: Repository<Competence>,
    private readonly instruments: InstrumentService,
    private readonly calibrations: CalibrationService,
    private readonly dataSource: DataSource,
  ) {}

  async load(): Promise<number> {
    this.random = new DeterministicRandom(DEMO_SEED);

    const held = await this.register.count();

    if (held > 0) {
      this.log.log(`the register already holds ${held} instruments, leaving it alone`);
      return 0;
    }

    await this.createStaff();
    await this.authoriseStaff();

    const standard = await this.createStandard();
    const bench = await this.createBench();

    await this.calibrateEverything(standard, bench);
    await this.logSomeWork(bench);

    const loaded = await this.register.count();

    this.log.log(`demo estate loaded: ${loaded} instruments`);
    return loaded;
  }

  private async createStaff(): Promise<void> {
    const hash = hashSync(DEMO_PASSWORD, 4);

    for (const person of STAFF) {
      const held = await this.users.findOne({ where: { username: person.username } });

      if (held) {
        continue;
      }

      const user = new AppUser();

      user.username = person.username;
      user.displayName = person.name;
      user.email = `${person.username}@slipgauge.internal`;
      user.passwordHash = hash;
      user.enabled = true;
      user.lockedUntil = null;
      user.failedAttempts = 0;
      user.passwordSetAt = new Date('2025-01-06T08:00:00Z');
      user.lastLoginAt = null;

      const saved = await this.users.save(user);

      for (const role of person.roles) {
        await this.dataSource.query(
          'insert into app_user_role (user_id, role) values ($1, $2)',
          [saved.id, role],
        );
      }
    }
  }

  /**
   * Grants the demo staff what they need to do the work the demo then does.
   *
   * <p>Without this the demo loads a laboratory nobody is allowed to work in,
   * which is exactly what happened the first time the authorisation register
   * went live: every sheet the loader filed was refused, and the message said
   * it was the bench's fault rather than the demo's.
   */
  private async authoriseStaff(): Promise<void> {
    for (const person of STAFF) {
      if (person.level === null) {
        continue;
      }
      for (const discipline of person.authorised) {
        const held = await this.competence.count({
          where: { person: person.username, discipline, level: person.level },
        });

        if (held > 0) {
          continue;
        }
        await this.competence.save(
          competence(
            person.username,
            discipline,
            person.level,
            'h.whitcombe',
            AUTHORISED_FROM,
          ).running(AUTHORISED_FROM, AUTHORISED_TO),
        );
      }
    }
  }

  private async createStandard(): Promise<Instrument> {
    const created = await this.instruments.register({
      classCode: 'GB-SET',
      manufacturer: 'Koba',
      model: 'BM1-88-1',
      serialNumber: '7741-2201',
      description: 'Grade K gauge block set, the bench reference',
      unit: 'mm',
      rangeLow: 0.5,
      rangeHigh: 100,
      resolution: 0.00001,
      locationCode: 'HARLOW-DIM',
      custodian: 'H Whitcombe',
      referenceStandard: true,
      acquiredOn: '2019-06-04',
    });

    return this.register.findOneOrFail({
      where: { id: created.id },
      relations: { instrumentClass: true },
    });
  }

  private async createBench(): Promise<Instrument[]> {
    const built: Instrument[] = [];

    for (const [index, kit] of BENCH.entries()) {
      const created = await this.instruments.register({
        classCode: kit.classCode,
        manufacturer: kit.maker,
        model: kit.model,
        serialNumber: `SN-${74_000 + index * 137}`,
        unit: kit.unit,
        rangeLow: kit.low,
        rangeHigh: kit.high,
        resolution: kit.resolution,
        locationCode: kit.room,
        custodian: index % 2 === 0 ? 'R Okonjo' : 'D Ferreira',
        referenceStandard: false,
        acquiredOn: plusDays('2021-03-01', index * 40),
      });

      built.push(
        await this.register.findOneOrFail({
          where: { id: created.id },
          relations: { instrumentClass: true },
        }),
      );
    }
    return built;
  }

  /**
   * Three years of history, so the interval engine has something to have
   * decided and the drift chart has something to draw.
   */
  private async calibrateEverything(standard: Instrument, bench: Instrument[]): Promise<void> {
    let certificate = 1;

    for (let year = 0; year < 3; year++) {
      const on = plusYears('2023-02-06', year);

      await this.calibrations.record(
        this.sheet(`SGM-STD-${certificate++}`, standard, on, 5, 5.00001, 0.00005, outsideStandard()),
      );

      for (const instrument of bench) {
        const benchDay = plusDays(on, 20 + this.random.nextInt(40));
        const nominal = midpointOf(instrument);

        await this.calibrations.record(
          this.sheet(
            `SGM-${certificate++}`,
            instrument,
            benchDay,
            nominal,
            drifted(nominal, year),
            0.0004,
            internalStandard(standard),
          ),
        );
      }
    }
  }

  private sheet(
    number: string,
    instrument: Instrument,
    on: string,
    nominal: number,
    asFound: number,
    uncertainty: number,
    standard: StandardInput,
  ): RecordCalibrationDto {
    return {
      certificateNumber: number,
      assetTag: instrument.assetTag,
      performedOn: on,
      issuedOn: on,
      performedBy: 'r.okonjo',
      issuingLab: LAB,
      externalLab: false,
      adjusted: false,
      ambientTemperature: 20.1,
      ambientHumidity: 44,
      acceptancePolicy: AcceptancePolicy.MANAGED_RISK,
      points: [
        {
          sequenceNo: 1,
          label: `${nominal} ${instrument.unit}`,
          nominal,
          asFound,
          asLeft: asFound,
          expandedUncertainty: uncertainty,
          coverageFactor: 2,
        },
      ],
      standards: [standard],
    };
  }

  private async logSomeWork(bench: Instrument[]): Promise<void> {
    for (let i = 0; i < 40; i++) {
      const instrument = this.random.pick(bench);

      await this.usage.save(
        usageRecord(
          instrument,
          plusDays('2025-01-06', this.random.nextInt(500)),
          i % 2 === 0 ? 'R Okonjo' : 'D Ferreira',
        )
          .onJob(
            `WO-${88_000 + i}`,
            CUSTOMERS[i % CUSTOMERS.length] as string,
            'in process dimensional check',
          )
          .withReadings(4 + this.random.nextInt(20)),
      );
    }
  }
}

/**
 * A nominal every instrument can actually reach. The bench ranges from a dial
 * test indicator with eight tenths of a millimetre to a caliper with two
 * hundred, so a fixed nominal is refused by half of them.
 */
function midpointOf(instrument: Instrument): number {
  return (instrument.rangeLow + instrument.rangeHigh) / 2;
}

/** Drift that grows year on year, which is what makes the chart worth looking at. */
function drifted(nominal: number, year: number): number {
  return nominal + 0.0008 * year;
}

function outsideStandard(): StandardInput {
  return {
    externalRef: 'NPL length bar 12/4471',
    externalLab: 'National Physical Laboratory',
    externalCertificateNumber: 'NPL-2024-88213',
    externalAccreditation: 'UKAS 0478',
    externalValidFrom: '2020-01-01',
    externalValidTo: '2030-01-01',
    role: StandardRole.REFERENCE,
  };
}

function internalStandard(standard: Instrument): StandardInput {
  return { assetTag: standard.assetTag, role: StandardRole.REFERENCE };
}
