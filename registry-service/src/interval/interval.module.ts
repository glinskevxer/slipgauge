import { Module } from '@nestjs/common';

import { IntervalEngine } from './interval.engine';

@Module({
  providers: [IntervalEngine],
  exports: [IntervalEngine],
})
export class IntervalModule {}
