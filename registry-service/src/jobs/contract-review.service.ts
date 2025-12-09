import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { AcceptancePolicy } from '../calibration/conformity/acceptance-policy';
import { ConflictError, NotFoundError, RuleViolationError } from '../common/errors';
import { Clock } from '../config/clock';
import { AssetTagService } from '../instrument/asset-tag.service';
import { Instrument } from '../instrument/instrument.entity';
import { InstrumentStatus } from '../instrument/instrument.enums';
import { CapabilityService } from './capability.service';
import { ContractReview, reviewFrom } from './contract-review.entity';
import type { DeclineJobDto, ReviewJobDto, ReviewPreview } from './dto/review-job.dto';
import type { JobView } from './dto/job.views';
import { JobItem } from './job-item.entity';
import { Job } from './job.entity';
import { JobService } from './job.service';
import { JobState } from './job.enums';
import {
  ReviewClause,
  ReviewFinding,
  ReviewOutcome,
  actionable,
  outcomeFor,
} from './review/review-clause';
import { ReviewableItem, ReviewableJob, reviewJob } from './review/review-checker';

/**
 * Contract review, and what happens either side of it.
 *
 * <p>The reviewer's part is small and deliberately so. The checker decides what
 * the laboratory can and cannot do; the reviewer decides whether the customer
 * has agreed to the parts we cannot. Accepting the job is the moment the
 * customer's items become register rows, and it is the only moment they do.
 */
@Injectable()
export class ContractReviewService {
  private readonly log = new Logger(ContractReviewService.name);

  constructor(
    @InjectRepository(ContractReview) private readonly reviews: Repository<ContractReview>,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    private readonly capability: CapabilityService,
    private readonly desk: JobService,
    private readonly tags: AssetTagService,
    private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  /**
   * What the review would say, without writing anything down.
   *
   * <p>With no decision rule proposed the fourth clause is left unjudged rather
   * than failed. The desk runs this before ringing the customer, and a preview
   * that always came back declined until somebody had agreed a rule would be
   * telling them the one thing they already know.
   */
  async preview(reference: string, policy: AcceptancePolicy | null = null): Promise<ReviewPreview> {
    const record = await this.desk.byReference(reference);
    const raised = await this.check(record, policy);
    const findings =
      policy === null
        ? raised.filter((item) => item.clause !== ReviewClause.DECISION_RULE)
        : raised;

    return {
      reference: record.reference,
      outcome: outcomeFor(findings),
      findings: actionable(findings).map((item) => ({
        clause: item.clause,
        severity: item.severity,
        lineNumber: item.lineNumber,
        detail: item.detail,
      })),
      acceptable: outcomeFor(findings) !== ReviewOutcome.DECLINED,
      decisionRulePending: policy === null,
    };
  }

  /**
   * Runs the review, records it, and takes the job on when it passes.
   *
   * <p>Everything happens in one transaction. A review that recorded itself and
   * then failed to raise the register rows would leave a job that says it was
   * accepted with nothing on the bench to work on, and the desk would have no
   * way to tell that from a job nobody had started.
   */
  async review(reference: string, reviewedBy: string, request: ReviewJobDto): Promise<JobView> {
    const record = await this.desk.byReference(reference);

    if (record.state !== JobState.RECEIVED && record.state !== JobState.UNDER_REVIEW) {
      throw new ConflictError(`${record.reference} is ${record.state} and has been reviewed`);
    }

    const findings = await this.check(record, request.acceptancePolicy);
    const outcome = outcomeFor(findings);
    const today = this.clock.today();

    await this.dataSource.transaction(async (manager) => {
      const review = reviewFrom(record.id, outcome, reviewedBy, today, findings);

      review.acceptancePolicy =
        outcome === ReviewOutcome.DECLINED ? null : request.acceptancePolicy;
      review.methodReference = request.methodReference ?? null;
      if (request.comment) {
        review.findings = [review.findings, `reviewer: ${request.comment}`]
          .filter(Boolean)
          .join('\n');
      }
      review.validate();

      if (record.state === JobState.RECEIVED) {
        record.moveTo(JobState.UNDER_REVIEW, today);
      }
      record.moveTo(
        outcome === ReviewOutcome.DECLINED ? JobState.DECLINED : JobState.ACCEPTED,
        today,
      );

      await manager.save(ContractReview, review);
      await manager.save(Job, record);

      if (outcome !== ReviewOutcome.DECLINED) {
        await this.raiseRegisterRows(manager, record);
      }
    });

    this.log.log(`${record.reference} reviewed by ${reviewedBy}: ${outcome}`);
    return this.desk.get(record.reference);
  }

  /** Turning the job away on the reviewer's own judgement. */
  async decline(reference: string, reviewedBy: string, request: DeclineJobDto): Promise<JobView> {
    const record = await this.desk.byReference(reference);

    if (!record.isOpen() || record.state === JobState.IN_PROGRESS) {
      throw new RuleViolationError(
        `${record.reference} is ${record.state} and can no longer be declined`,
      );
    }
    const today = this.clock.today();
    const existing = await this.reviews.findOne({ where: { jobId: record.id } });
    const review = existing ?? reviewFrom(record.id, ReviewOutcome.DECLINED, reviewedBy, today, []);

    review.outcome = ReviewOutcome.DECLINED;
    review.reviewedBy = reviewedBy;
    review.reviewedOn = today;
    review.acceptancePolicy = null;
    review.declinedReason = request.reason;
    review.validate();

    if (record.state === JobState.RECEIVED) {
      record.moveTo(JobState.UNDER_REVIEW, today);
    }
    record.moveTo(JobState.DECLINED, today);

    await this.reviews.save(review);
    await this.jobs.save(record);
    this.log.log(`${record.reference} declined by ${reviewedBy}: ${request.reason}`);
    return this.desk.get(record.reference);
  }

  /** The review as recorded, for the job sheet and for an assessor. */
  async get(reference: string): Promise<ContractReview> {
    const record = await this.desk.byReference(reference);
    const review = await this.reviews.findOne({ where: { jobId: record.id } });

    if (!review) {
      throw new NotFoundError('contract review', reference);
    }
    return review;
  }

  private async check(
    record: Job,
    policy: ReviewJobDto['acceptancePolicy'] | null,
  ): Promise<ReviewFinding[]> {
    const classIds = record.items
      .map((item) => item.classId ?? item.instrumentClass?.id ?? null)
      .filter((id): id is number => id !== null);

    const capabilityOf = await this.capability.lookupFor(classIds);

    const reviewable: ReviewableJob = {
      reference: record.reference,
      instructions: record.instructions,
      accreditedRequired: record.customer.accreditedRequired,
      customerReachable: record.customer.isReachable(),
      proposedPolicy: policy,
      items: record.items.map(
        (item): ReviewableItem => ({
          lineNumber: item.lineNumber,
          service: item.service,
          condition: item.condition,
          classId: item.classId ?? item.instrumentClass?.id ?? null,
          description: item.description,
          rangeHigh: item.rangeHigh,
          toleranceStated: item.toleranceStated,
        }),
      ),
    };

    return reviewJob(reviewable, capabilityOf);
  }

  /**
   * Raises a register row for every line that can carry one, and ties the line
   * to it. A line the desk could not identify is left alone: it has to be
   * identified before it can be worked on, and inventing a class here would put
   * a made up instrument in the register.
   */
  private async raiseRegisterRows(manager: EntityManager, record: Job): Promise<void> {
    for (const line of record.items) {
      if (line.instrument || !line.isIdentified() || !line.isCalibratable()) {
        continue;
      }

      const existing = await manager.findOne(Instrument, {
        where: {
          manufacturer: line.manufacturer ?? undefined,
          model: line.model ?? undefined,
          serialNumber: line.serialNumber ?? undefined,
        },
      });

      const instrument = existing ?? new Instrument();

      if (!existing) {
        instrument.assetTag = await this.tags.next();
        instrument.instrumentClass = line.instrumentClass!;
        instrument.manufacturer = line.manufacturer!;
        instrument.model = line.model!;
        instrument.serialNumber = line.serialNumber!;
        instrument.unit = '';
        instrument.description = line.description;
        instrument.acquiredOn = record.receivedOn;
        instrument.status = InstrumentStatus.IN_CALIBRATION;
        instrument.applySpan(0, line.rangeHigh ?? 1, 0.000001);
        instrument.markAsReference(false);
        instrument.custodian = record.customer.code;
      }

      const saved = await manager.save(Instrument, instrument);

      line.registeredAs(saved);
      await manager.save(JobItem, line);
    }
  }
}
