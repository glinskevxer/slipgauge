import { defineConfig, devices } from '@playwright/test';

/**
 * End to end against the built console with the registry service stubbed at
 * the network boundary.
 *
 * <p>Stubbing rather than standing the real service up is deliberate for this
 * suite. These tests are about the console's own behaviour, the guards, the
 * wizard, the stale response handling, and running them against a live
 * database made them slow and made a failure ambiguous. The stack coming up
 * for real is proved separately in the images workflow.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: process.env['CI']
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:4300',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm --prefix registry-console run start -- --port 4300 --host 127.0.0.1',
    cwd: __dirname,
    url: 'http://127.0.0.1:4300',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
