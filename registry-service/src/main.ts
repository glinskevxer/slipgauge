import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';
import type { LabConfig } from './config/lab.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const lab = config.getOrThrow<LabConfig>('lab');

  app.setGlobalPrefix('api', { exclude: ['health', 'health/readiness', 'metrics'] });

  app.useGlobalPipes(
    new ValidationPipe({
      // A body carrying a field the request does not define is a mistake
      // somewhere, and silently ignoring it is how the mistake survives.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const port = Number(process.env['PORT'] ?? 8080);
  await app.listen(port, '0.0.0.0');

  new Logger('bootstrap').log(
    `${lab.name} registry listening on ${port}, accreditation ${lab.accreditationRef}`,
  );
}

void bootstrap();
