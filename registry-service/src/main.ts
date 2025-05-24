import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';
import { ProblemDetailFilter } from './common/problem-detail.filter';
import type { LabConfig } from './config/lab.config';
import { mountOpenApi } from './config/openapi';
import type { SecurityConfig } from './config/security.config';

/** Routes that answer before the api prefix, for an operator with no token. */
const UNPREFIXED = ['health', 'health/readiness', 'metrics'];

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const lab = config.getOrThrow<LabConfig>('lab');
  const security = config.getOrThrow<SecurityConfig>('security');

  app.setGlobalPrefix('api', { exclude: UNPREFIXED });

  app.useGlobalFilters(new ProblemDetailFilter());

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

  // Named origins only. A wildcard with credentials is refused by every
  // browser anyway, so allowing one would just move the failure somewhere
  // harder to read.
  app.enableCors({
    origin: security.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Correlation-Id'],
    exposedHeaders: ['X-Correlation-Id'],
    maxAge: 600,
  });

  // The register is behind a reverse proxy that terminates TLS, so the client
  // address the rate limiter and the audit trail see comes from the header it
  // sets rather than from the socket.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  mountOpenApi(app, lab);

  // Migrations run at start up and a half applied schema is worse than a
  // failed boot, so the process gets the chance to close cleanly.
  app.enableShutdownHooks();

  const port = Number(process.env['PORT'] ?? 8080);
  await app.listen(port, '0.0.0.0');

  new Logger('bootstrap').log(
    `${lab.name} registry listening on ${port}, accreditation ${lab.accreditationRef}, ` +
      `console origins ${security.allowedOrigins.join(' ')}`,
  );
}

void bootstrap();
