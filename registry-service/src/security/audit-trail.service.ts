import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Page, SortWhitelist, pageOf } from '../common/page';
import { AuditEvent, AuditOutcome, auditEvent } from './audit-event.entity';

const AUDIT_SORT = new SortWhitelist('occurredAt')
  .allow('occurredAt', 'occurred_at')
  .allow('actor')
  .allow('action')
  .allow('subject');

/**
 * Writes the audit trail.
 *
 * <p>A failure to write a line is logged and swallowed. That is a deliberate
 * trade: losing one audit line is bad, but failing the request that was being
 * audited turns a logging outage into a service outage, and the operation it
 * describes has already happened by the time this runs.
 */
@Injectable()
export class AuditTrail {
  private readonly log = new Logger(AuditTrail.name);

  constructor(@InjectRepository(AuditEvent) private readonly events: Repository<AuditEvent>) {}

  async allowed(
    actor: string,
    action: string,
    subject: string,
    subjectId: string | null,
    detail: string | null = null,
  ): Promise<void> {
    await this.write(actor, action, subject, subjectId, AuditOutcome.ALLOWED, detail);
  }

  async denied(
    actor: string,
    action: string,
    subject: string,
    subjectId: string | null,
    detail: string | null = null,
  ): Promise<void> {
    await this.write(actor, action, subject, subjectId, AuditOutcome.DENIED, detail);
  }

  async failed(
    actor: string,
    action: string,
    subject: string,
    subjectId: string | null,
    detail: string | null = null,
  ): Promise<void> {
    await this.write(actor, action, subject, subjectId, AuditOutcome.FAILED, detail);
  }

  async search(
    actor: string | undefined,
    subject: string | undefined,
    page = 0,
    size = 50,
    sort?: string,
  ): Promise<Page<AuditEvent>> {
    const paging = AUDIT_SORT.paging(page, size);
    const where: Record<string, string> = {};

    if (actor) {
      where['actor'] = actor;
    }
    if (subject) {
      where['subject'] = subject;
    }

    const [rows, total] = await this.events.findAndCount({
      where,
      order: AUDIT_SORT.resolve(sort, 'audit') as never,
      skip: paging.skip,
      take: paging.take,
    });

    return pageOf(rows, total, paging.page, paging.size, (row) => row);
  }

  private async write(
    actor: string,
    action: string,
    subject: string,
    subjectId: string | null,
    outcome: AuditOutcome,
    detail: string | null,
  ): Promise<void> {
    try {
      await this.events.save(auditEvent(actor, action, subject, subjectId, outcome, detail));
    } catch (failure) {
      this.log.error(
        `could not write the audit line ${actor} ${action} ${subject}: ${String(failure)}`,
      );
    }
  }
}
