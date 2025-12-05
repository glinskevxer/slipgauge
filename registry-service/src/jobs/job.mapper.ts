import { Injectable } from '@nestjs/common';

import { Clock } from '../config/clock';
import { ContractReview } from './contract-review.entity';
import type { ContractReviewView, JobItemView, JobSummary, JobView } from './dto/job.views';
import { JobItem } from './job-item.entity';
import { Job } from './job.entity';
import { workingDaysBetween } from './working-days';

/**
 * Entities to the shapes the console is built against.
 *
 * <p>Lateness is worked out here rather than stored, because it is a reading of
 * the clock rather than a fact about the job, and a stored one goes stale
 * overnight in exactly the place the desk is looking.
 */
@Injectable()
export class JobMapper {
  constructor(private readonly clock: Clock) {}

  toView(job: Job, review: ContractReview | null): JobView {
    return {
      id: job.id,
      reference: job.reference,
      customerCode: job.customer?.code ?? '',
      customerName: job.customer?.name ?? '',
      state: job.state,
      priority: job.priority,
      receivedOn: job.receivedOn,
      promisedOn: job.promisedOn,
      completedOn: job.completedOn,
      dispatchedOn: job.dispatchedOn,
      receivedBy: job.receivedBy,
      customerOrder: job.customerOrder,
      instructions: job.instructions,
      items: [...(job.items ?? [])]
        .sort((a, b) => a.lineNumber - b.lineNumber)
        .map((item) => this.toItemView(item)),
      review: review ? toReviewView(review) : null,
      lateness: this.latenessOf(job),
      open: job.isOpen(),
    };
  }

  toSummary(job: Job, itemCount: number): JobSummary {
    return {
      id: job.id,
      reference: job.reference,
      customerCode: job.customer?.code ?? '',
      customerName: job.customer?.name ?? '',
      state: job.state,
      priority: job.priority,
      receivedOn: job.receivedOn,
      promisedOn: job.promisedOn,
      itemCount,
      lateness: this.latenessOf(job),
      open: job.isOpen(),
    };
  }

  toItemView(item: JobItem): JobItemView {
    return {
      id: item.id,
      lineNumber: item.lineNumber,
      service: item.service,
      description: item.description,
      manufacturer: item.manufacturer,
      model: item.model,
      serialNumber: item.serialNumber,
      classCode: item.instrumentClass?.code ?? null,
      className: item.instrumentClass?.name ?? null,
      condition: item.condition,
      accessories: item.accessories,
      note: item.note,
      rangeHigh: item.rangeHigh,
      toleranceStated: item.toleranceStated,
      assetTag: item.instrument?.assetTag ?? null,
      calibratable: item.isCalibratable(),
    };
  }

  /**
   * Working days past the promise. A finished job is measured against the day
   * it was finished, so the desk's late list does not fill up with work that
   * went out months ago.
   */
  latenessOf(job: Job): number {
    const measured = job.completedOn ?? this.clock.today();

    return workingDaysBetween(job.promisedOn, measured);
  }
}

export function toReviewView(review: ContractReview): ContractReviewView {
  return {
    outcome: review.outcome,
    reviewedBy: review.reviewedBy,
    reviewedOn: review.reviewedOn,
    requirementsDefined: review.requirementsDefined,
    capabilityConfirmed: review.capabilityConfirmed,
    methodSelected: review.methodSelected,
    decisionRuleAgreed: review.decisionRuleAgreed,
    acceptancePolicy: review.acceptancePolicy,
    methodReference: review.methodReference,
    findings: review.findings ? review.findings.split('\n') : [],
    declinedReason: review.declinedReason,
  };
}
