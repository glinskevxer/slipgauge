import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { RuleViolationError } from '../common/errors';
import { Clock } from '../config/clock';
import { Instrument } from '../instrument/instrument.entity';
import { InstrumentStatus } from '../instrument/instrument.enums';
import { ContractReview } from './contract-review.entity';
import type { JobView } from './dto/job.views';
import { Job } from './job.entity';
import { JobService } from './job.service';
import { JobState } from './job.enums';

/** One line's answer to "is this finished". */
export interface LineProgress {
  readonly lineNumber: number;
  readonly assetTag: string | null;
  readonly certificateNumber: string | null;
  readonly done: boolean;
  readonly reason: string | null;
}

/**
 * Moving a job along the bench, and refusing to move it when the work behind it
 * is not there.
 *
 * <p>Completion is the interesting one. The desk does not get to say a job is
 * finished: the certificates say so. Every line that was taken on for
 * measurement work has to have a certificate against its register row that was
 * issued on or after the job arrived, and none of them may have been withdrawn
 * since. That is the rule the whole state machine exists to protect, because a
 * job marked complete is a job that gets invoiced and posted back.
 */
@Injectable()
export class JobProgressService {
  private readonly log = new Logger(JobProgressService.name);

  constructor(
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(ContractReview) private readonly reviews: Repository<ContractReview>,
    @InjectRepository(CalibrationCertificate)
    private readonly certificates: Repository<CalibrationCertificate>,
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    private readonly desk: JobService,
    private readonly clock: Clock,
  ) {}

  /** Puts an accepted job on the bench. */
  async start(reference: string): Promise<JobView> {
    const record = await this.desk.byReference(reference);
    const review = await this.reviews.findOne({ where: { jobId: record.id } });

    if (!review?.permitsWork()) {
      throw new RuleViolationError(
        `${record.reference} has not passed contract review and cannot be started`,
      );
    }
    record.moveTo(JobState.IN_PROGRESS, this.clock.today());
    await this.jobs.save(record);
    return this.desk.get(record.reference);
  }

  /**
   * Finishes a job, once every measurement line has a certificate behind it.
   * The refusal names the lines rather than saying no, because the bench needs
   * to know which item is holding the van up.
   */
  async complete(reference: string): Promise<JobView> {
    const record = await this.desk.byReference(reference);
    const progress = await this.progress(record);
    const outstanding = progress.filter((line) => !line.done);

    if (outstanding.length > 0) {
      throw new RuleViolationError(
        `${record.reference} is not finished: ` +
          outstanding.map((line) => `line ${line.lineNumber} ${line.reason}`).join('; '),
      );
    }
    record.moveTo(JobState.COMPLETED, this.clock.today());
    await this.jobs.save(record);
    this.log.log(`${record.reference} completed with ${progress.length} line(s) certified`);
    return this.desk.get(record.reference);
  }

  /**
   * Hands the items back. Every register row raised for the job goes back to in
   * service on the way out, because a customer item sitting in calibration for
   * ever is the state that quietly blocks it being booked in again.
   */
  async dispatch(reference: string): Promise<JobView> {
    const record = await this.desk.byReference(reference);

    record.moveTo(JobState.DISPATCHED, this.clock.today());

    for (const line of record.registeredItems()) {
      const instrument = line.instrument!;

      if (instrument.status === InstrumentStatus.IN_CALIBRATION) {
        instrument.transitionTo(InstrumentStatus.IN_SERVICE);
        await this.instruments.save(instrument);
      }
    }
    await this.jobs.save(record);
    this.log.log(`${record.reference} dispatched`);
    return this.desk.get(record.reference);
  }

  /** Where every line has got to, which is what the bench screen reads. */
  async progressOf(reference: string): Promise<LineProgress[]> {
    return this.progress(await this.desk.byReference(reference));
  }

  private async progress(record: Job): Promise<LineProgress[]> {
    const lines = record.items.filter((item) => item.isCalibratable());
    const instrumentIds = lines
      .map((line) => line.instrument?.id ?? null)
      .filter((id): id is number => id !== null);

    const certificates = instrumentIds.length
      ? await this.certificates.find({
          where: {
            instrument: { id: In(instrumentIds) },
            withdrawnAt: IsNull(),
          },
          order: { issuedOn: 'DESC', id: 'DESC' },
        })
      : [];

    const latest = new Map<number, CalibrationCertificate>();
    for (const certificate of certificates) {
      if (certificate.issuedOn >= record.receivedOn && !latest.has(certificate.instrumentId)) {
        latest.set(certificate.instrumentId, certificate);
      }
    }

    return lines.map((line) => {
      if (!line.instrument) {
        return {
          lineNumber: line.lineNumber,
          assetTag: null,
          certificateNumber: null,
          done: false,
          reason: 'was never identified, so it is not in the register',
        };
      }
      const certificate = latest.get(line.instrument.id);

      return {
        lineNumber: line.lineNumber,
        assetTag: line.instrument.assetTag,
        certificateNumber: certificate?.certificateNumber ?? null,
        done: Boolean(certificate),
        reason: certificate ? null : 'has no certificate filed since the job arrived',
      };
    });
  }
}
