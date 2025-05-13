import { MiddlewareConsumer, Global, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ImpactAssessment } from '../impact/impact-assessment.entity';
import { Instrument } from '../instrument/instrument.entity';
import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { RegistryMetrics } from './registry-metrics.service';

/**
 * Global, because the metrics service is written to from half the modules and
 * threading it through every import list would be the only thing those lists
 * had in common.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Instrument, ImpactAssessment])],
  controllers: [HealthController, MetricsController],
  providers: [RegistryMetrics],
  exports: [RegistryMetrics],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
