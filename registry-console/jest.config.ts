import type { Config } from 'jest';

/**
 * The whole repository keeps its tests under /tests, so the Jest root is the
 * repository rather than this project. That moves module resolution out from
 * under this package, which is why the Angular transformer is resolved by
 * absolute path instead of by preset name.
 */
const transformer = require.resolve('jest-preset-angular', { paths: [__dirname] });

const config: Config = {
  rootDir: '..',
  roots: ['<rootDir>/tests/frontend'],
  testMatch: ['<rootDir>/tests/frontend/**/*.spec.ts'],
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/frontend/setup-jest.ts'],
  moduleFileExtensions: ['ts', 'html', 'js', 'json', 'mjs'],
  modulePaths: ['<rootDir>/registry-console/node_modules'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/registry-console/src/app/core/$1',
    '^@shared/(.*)$': '<rootDir>/registry-console/src/app/shared/$1',
    '^@features/(.*)$': '<rootDir>/registry-console/src/app/features/$1',
    '^src/(.*)$': '<rootDir>/registry-console/src/$1',
    '^@fixtures$': '<rootDir>/tests/frontend/support/factories',
  },
  snapshotSerializers: [
    require.resolve('jest-preset-angular/build/serializers/no-ng-attributes', {
      paths: [__dirname],
    }),
    require.resolve('jest-preset-angular/build/serializers/ng-snapshot', { paths: [__dirname] }),
    require.resolve('jest-preset-angular/build/serializers/html-comment', { paths: [__dirname] }),
  ],
  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      transformer,
      {
        tsconfig: '<rootDir>/registry-console/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)$',
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
  collectCoverageFrom: [
    '<rootDir>/registry-console/src/app/**/*.ts',
    '!<rootDir>/registry-console/src/app/**/*.routes.ts',
  ],
  coverageDirectory: '<rootDir>/registry-console/coverage',
};

export default config;
