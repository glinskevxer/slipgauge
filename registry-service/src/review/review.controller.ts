import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { BadRequestError } from '../common/errors';
import { Clock } from '../config/clock';
import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import type { ManagementReview } from './management-review';
import { ManagementReviewService } from './management-review.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

@ApiTags('review')
@ApiBearerAuth('registry-token')
@RequireRoles(Role.QUALITY_MANAGER)
@Controller('management-review')
export class ManagementReviewController {
  constructor(
    private readonly review: ManagementReviewService,
    private readonly clock: Clock,
  ) {}

  /**
   * The pack for a period, defaulting to the last twelve months.
   *
   * <p>Read only and behind the quality manager role. The pack names people and
   * what they scored, which is not a bench screen.
   */
  @Get()
  pack(@Query('from') from?: string, @Query('to') to?: string): Promise<ManagementReview> {
    const end = to ?? this.clock.today();
    const start = from ?? this.clock.daysFromToday(-365);

    for (const [name, value] of [
      ['from', start],
      ['to', end],
    ] as const) {
      if (!ISO_DATE.test(value)) {
        throw new BadRequestError(`${name} has to be written as yyyy-mm-dd`);
      }
    }
    if (start > end) {
      throw new BadRequestError('the period cannot end before it starts');
    }
    return this.review.pack(start, end);
  }
}
