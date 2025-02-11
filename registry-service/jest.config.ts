import type { Config } from 'jest';

// Resolved by absolute path. The root is the repository, which moves module
// resolution out from under this package and leaves a bare name unfindable.
const tsJest = require.resolve('ts-jest', { paths: [__dirname] });

/**
 * Unit tests. No database, no Nest container, nothing that has to be started,
 * which is what keeps them worth running on every save.
 *
 * <p>The whole repository keeps its tests under /tests, so the root is the
 * repository rather than this package.
 */
const config: Config = {
  rootDir: '..',
  roots: ['<rootDir>/tests/backend'],
  testMatch: ['<rootDir>/tests/backend/**/*.spec.ts'],
  testPathIgnorePatterns: ['\\.it-spec\\.ts$'],
  testEnvironment: 'node',
  setupFiles: [require.resolve('reflect-metadata', { paths: [__dirname] })],
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
  collectCoverageFrom: [
    '<rootDir>/registry-service/src/**/*.ts',
    '!<rootDir>/registry-service/src/**/*.module.ts',
    '!<rootDir>/registry-service/src/main.ts',
    '!<rootDir>/registry-service/src/database/migrations/**',
  ],
  coverageDirectory: '<rootDir>/registry-service/coverage',
};

export default config;
