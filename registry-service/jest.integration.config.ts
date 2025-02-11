import type { Config } from 'jest';

// Resolved by absolute path. The root is the repository, which moves module
// resolution out from under this package and leaves a bare name unfindable.
const tsJest = require.resolve('ts-jest', { paths: [__dirname] });

/**
 * Integration tests, against a real PostgreSQL with the migrations run for
 * real. The server binary is unpacked by the test rather than supplied by a
 * container runtime, so these need nothing but Node on the machine.
 *
 * <p>Serial on purpose. They share one database, and a suite that truncates
 * between tests cannot also run beside itself.
 */
const config: Config = {
  rootDir: '..',
  roots: ['<rootDir>/tests/backend'],
  testMatch: ['<rootDir>/tests/backend/**/*.it-spec.ts'],
  testEnvironment: 'node',
  setupFiles: [require.resolve('reflect-metadata', { paths: [__dirname] })],
  maxWorkers: 1,
  testTimeout: 30_000,
  globalSetup: '<rootDir>/tests/backend/support/global-setup.ts',
  globalTeardown: '<rootDir>/tests/backend/support/global-teardown.ts',
  transform: {
    '^.+\\.ts$': [
      tsJest,
      { tsconfig: '<rootDir>/registry-service/tsconfig.spec.json', isolatedModules: false },
    ],
  },
  modulePaths: ['<rootDir>/registry-service/node_modules'],
  moduleNameMapper: {
    '^@registry/(.*)$': '<rootDir>/registry-service/src/$1',
  },
};

export default config;
