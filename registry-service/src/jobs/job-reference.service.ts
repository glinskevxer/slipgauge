import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ConflictError } from '../common/errors';
import { Job } from './job.entity';

/** J-2025-0001. Year first, so a filing cabinet sorts the way the desk thinks. */
const PATTERN = /^J-(\d{4})-(\d{4,6})$/;
const WIDTH = 4;

/**
 * Hands out job references.
 *
 * <p>The sequence restarts every year, because the desk quotes a reference over
 * the phone and a number that only ever grows becomes six digits somebody
 * mishears. The year is part of the reference rather than something looked up,
 * so a reference read off a label is enough to find the job with no other
 * context at all.
 */
@Injectable()
export class JobReferenceService {
  constructor(@InjectRepository(Job) private readonly jobs: Repository<Job>) {}

  /** The next reference for the year the item arrived in. */
  async next(receivedOn: string): Promise<string> {
    const year = receivedOn.slice(0, 4);
    const prefix = `J-${year}-`;

    const highest = await this.jobs
      .createQueryBuilder('job')
      .select('max(job.reference)', 'reference')
      .where('job.reference like :prefix', { prefix: `${prefix}%` })
      .getRawOne<{ reference: string | null }>();

    return this.format(year, this.sequenceOf(highest?.reference ?? null) + 1);
  }

  format(year: string, sequence: number): string {
    if (sequence >= 10 ** 6) {
      throw new ConflictError(`the job sequence for ${year} has run out of width`);
    }
    return `J-${year}-${String(sequence).padStart(WIDTH, '0')}`;
  }

  /**
   * The numeric tail of a reference, or zero when it is not one of ours. A
   * reference typed in by hand during the changeover from the paper book does
   * not have to match, and it must not be allowed to reset the sequence.
   */
  sequenceOf(reference: string | null): number {
    if (!reference) {
      return 0;
    }
    const match = PATTERN.exec(reference);

    return match ? Number(match[2]) : 0;
  }

  /** True when the string is a reference this service would have produced. */
  isReference(value: string): boolean {
    return PATTERN.test(value);
  }
}
