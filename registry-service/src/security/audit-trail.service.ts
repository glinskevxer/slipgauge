import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Page, SortWhitelist, pageOf } from '../common/page';
import { Clock } from '../config/clock';
import { RETENTION_RULES, RetentionRule } from './audit-retention';
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

  constructor(
    @InjectRepository(AuditEvent) private readonly events: Repository<AuditEvent>,
    private readonly clock: Clock,
  ) {}

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

    // A query builder rather than findAndCount, because the sort whitelist
    // hands back alias qualified column names and the finder wants entity
    // property names. One of the two had to give and this is the one that can.
    const builder = this.events
      .createQueryBuilder('audit')
      .skip(paging.skip)
      .take(paging.take)
      .orderBy(AUDIT_SORT.resolve(sort, 'audit'));

    if (actor) {
      builder.andWhere('audit.actor = :actor', { actor });
    }
    if (subject) {
      builder.andWhere('audit.subject = :subject', { subject });
    }

    const [rows, total] = await builder.getManyAndCount();

    return pageOf(rows, total, paging.page, paging.size, (row) => row);
  }

  /**
   * Drops what has outlived its rule.
   *
   * <p>One delete per rule rather than a row by row walk. The trail is the
   * biggest table in the register within a year, and a sweep that loaded it to
   * decide would be the slowest thing the service does.
   *
   * <p>Nothing is dropped without saying how much and why, because the one
   * thing worse than an unbounded audit trail is one that quietly lost the
   * month somebody wanted.
   */
  async sweep(now: Date = this.clock.now()): Promise<AuditSweepResult> {
    const dropped: { rule: string; rows: number }[] = [];
    let total = 0;

    for (const rule of RETENTION_RULES) {
      const cutOff = new Date(now.getTime() - rule.days * 86_400_000);
      const builder = this.events
        .createQueryBuilder()
        .delete()
        .from(AuditEvent)
        .where('occurred_at < :cutOff', { cutOff });

      // The rules are read in order and the first match wins, so each delete
      // has to exclude what an earlier rule already claimed. Without this the
      // catch all would sweep the sign in lines on its own longer clock.
      const claimed = RETENTION_RULES.slice(0, RETENTION_RULES.indexOf(rule));

      for (const [index, earlier] of claimed.entries()) {
        builder.andWhere(
          `not (${matchSql(`e${index}`)})`,
          patternsFor(`e${index}`, earlier),
        );
      }
      builder.andWhere(matchSql('r'), patternsFor('r', rule));

      const result = await builder.execute();
      const rows = result.affected ?? 0;

      if (rows > 0) {
        dropped.push({ rule: rule.why, rows });
        total += rows;
        this.log.log(`audit sweep dropped ${rows} line(s): ${rule.why}`);
      }
    }
    return { dropped, total };
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

/** What one sweep dropped, and under which rule. */
export interface AuditSweepResult {
  readonly dropped: readonly { readonly rule: string; readonly rows: number }[];
  readonly total: number;
}

/**
 * The where clause for one rule: any of its action patterns, and one of its
 * outcomes when it names any.
 *
 * <p>The patterns are POSIX regular expressions on the way in, which is what
 * lets the rule table hold one shape rather than one for the code and one for
 * the sweep.
 */
function matchSql(prefix: string): string {
  // The arrays are cast explicitly. Without the cast the driver sends them as
  // an untyped parameter and PostgreSQL cannot choose an operator, so the
  // clause matches nothing and the sweep silently deletes none of it.
  return (
    `(action ~ any(:${prefix}Actions::text[])) and ` +
    `(:${prefix}AnyOutcome::boolean or outcome = any(:${prefix}Outcomes::text[]))`
  );
}

function patternsFor(prefix: string, rule: RetentionRule): Record<string, unknown> {
  return {
    [`${prefix}Actions`]: rule.actions.map((pattern) => pattern.source),
    [`${prefix}AnyOutcome`]: rule.outcomes === null,
    [`${prefix}Outcomes`]: rule.outcomes ?? [''],
  };
}
