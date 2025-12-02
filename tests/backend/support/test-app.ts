import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@registry/app.module';
import { ProblemDetailFilter } from '@registry/common/problem-detail.filter';
import { Clock, FixedClock } from '@registry/config/clock';
import { AppUser } from '@registry/security/app-user.entity';
import { Role } from '@registry/security/role';
import { TokenService } from '@registry/security/token.service';

/**
 * Boots the whole service against the shared embedded server with the
 * migrations run for real, configured exactly as main.ts configures it.
 *
 * <p>The pipe and the filter are set up here as well, because a test that runs
 * without them proves the controller works and nothing about what a caller
 * actually receives.
 */
export interface TestApp {
  readonly app: INestApplication;
  readonly dataSource: DataSource;
  close(): Promise<void>;
  /** Empties everything a test may have written, leaving reference data alone. */
  reset(): Promise<void>;
  /**
   * An access token for a throwaway account holding the given roles. The guard
   * is global, so a suite about anything else still needs one of these, and
   * signing in through bcrypt for every suite would cost more than the suite.
   */
  tokenFor(...roles: Role[]): string;
  /** A supertest client that already carries the token on every call. */
  api(token: string): ApiClient;
}

/** The verbs the suites use, each pre-authenticated. */
export interface ApiClient {
  get(url: string): request.Test;
  post(url: string): request.Test;
  put(url: string): request.Test;
  patch(url: string): request.Test;
  delete(url: string): request.Test;
}

/**
 * Tables tests write to, in the order they can safely be emptied. Reference
 * data loaded by the migrations is deliberately not here: a suite that wiped
 * the class list would pass and leave the next one with nothing to work from.
 */
const MUTABLE_TABLES = [
  'audit_event',
  'contract_review',
  'job_item',
  'job',
  'customer',
  'certificate_attachment',
  'impact_item',
  'impact_assessment',
  'usage_record',
  'interval_decision',
  'certificate_standard',
  'measurement_point',
  'calibration_certificate',
  'instrument',
];

/**
 * Options a suite can pin. Only the clock so far, because every scheduling
 * rule reads it and a suite that lets it run gets a different answer tomorrow.
 */
export interface TestAppOptions {
  readonly now?: string;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const builder = Test.createTestingModule({ imports: [AppModule] });

  if (options.now) {
    builder.overrideProvider(Clock).useValue(new FixedClock(new Date(options.now)));
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api', { exclude: ['health', 'health/readiness', 'metrics'] });
  app.useGlobalFilters(new ProblemDetailFilter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.init();

  const dataSource = app.get(DataSource);
  const tokens = app.get(TokenService);

  const tokenFor = (...roles: Role[]): string => {
    const account = new AppUser();

    account.id = 999_000;
    account.username = 'suite.runner';
    account.displayName = 'Suite runner';
    account.roles = roles.length > 0 ? roles : [Role.ADMIN];
    return tokens.issueAccess(account);
  };

  const api = (token: string): ApiClient => {
    const agent = () => request(app.getHttpServer());
    const bearer = `Bearer ${token}`;

    return {
      get: (url) => agent().get(url).set('Authorization', bearer),
      post: (url) => agent().post(url).set('Authorization', bearer),
      put: (url) => agent().put(url).set('Authorization', bearer),
      patch: (url) => agent().patch(url).set('Authorization', bearer),
      delete: (url) => agent().delete(url).set('Authorization', bearer),
    };
  };

  return {
    app,
    dataSource,
    tokenFor,
    api,
    close: () => app.close(),
    reset: async () => {
      for (const table of [...MUTABLE_TABLES].reverse()) {
        await dataSource.query(`truncate table ${table} restart identity cascade`);
      }
    },
  };
}

/** The tables a later suite adds are appended here rather than in each suite. */
export function registerMutableTable(...tables: string[]): void {
  for (const table of tables) {
    if (!MUTABLE_TABLES.includes(table)) {
      MUTABLE_TABLES.push(table);
    }
  }
}
