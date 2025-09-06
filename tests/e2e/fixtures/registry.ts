import { Page, Route, test as base } from '@playwright/test';

/**
 * A stub of the registry service, good enough for the console's own behaviour.
 * Each test can override any route before it navigates, so a spec that is
 * about a failure path does not have to describe every happy one.
 */
export interface RegistryStub {
  /** Replies to the next matching call with this body. */
  on(pattern: string | RegExp, body: unknown, status?: number): Promise<void>;
  /** How many times a pattern has been called. */
  callsTo(pattern: string): number;
}

export const SESSION = {
  accessToken: signedToken(Math.floor(Date.now() / 1000) + 3600),
  refreshToken: signedToken(Math.floor(Date.now() / 1000) + 36000),
  username: 'h.whitcombe',
  displayName: 'Helen Whitcombe',
  roles: ['METROLOGIST', 'QUALITY_MANAGER'],
};

export const CLASSES = [
  {
    id: 1,
    code: 'MIC-EXT',
    name: 'External micrometer',
    discipline: 'DIMENSIONAL',
    criticality: 'IMPORTANT',
    baseIntervalDays: 365,
    minIntervalDays: 180,
    maxIntervalDays: 730,
  },
  {
    id: 2,
    code: 'GB-SET',
    name: 'Gauge block set',
    discipline: 'DIMENSIONAL',
    criticality: 'CRITICAL',
    baseIntervalDays: 730,
    minIntervalDays: 365,
    maxIntervalDays: 1095,
  },
];

export const LOCATIONS = [
  {
    id: 1,
    code: 'HARLOW',
    name: 'Harlow site',
    site: 'HARLOW',
    parentCode: null,
    path: ['HARLOW'],
  },
  {
    id: 2,
    code: 'HARLOW-DIM',
    name: 'Dimensional room',
    site: 'HARLOW',
    parentCode: 'HARLOW',
    path: ['HARLOW', 'HARLOW-LAB', 'HARLOW-DIM'],
  },
];

export function instrument(id: number, assetTag: string, overrides: object = {}) {
  return {
    id,
    assetTag,
    manufacturer: 'Mitutoyo',
    model: '103-137',
    serialNumber: `SN-${id}`,
    classCode: 'MIC-EXT',
    discipline: 'DIMENSIONAL',
    criticality: 'IMPORTANT',
    status: 'IN_SERVICE',
    referenceStandard: false,
    locationCode: 'HARLOW-DIM',
    custodian: 'R Okonjo',
    acquiredOn: '2021-03-01',
    ...overrides,
  };
}

export function page1(items: unknown[], totalItems = items.length) {
  return {
    items,
    page: 0,
    size: 50,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / 50)),
    first: true,
    last: totalItems <= 50,
  };
}

/**
 * A page that has already signed in. Every spec but the sign in one opened
 * with the same six lines of form filling; this replaces them, and means a
 * change to the sign in screen breaks one file rather than four.
 */
export const test = base.extend<{ registry: RegistryStub; signedIn: Page }>({
  registry: async ({ page }, use) => {
    const calls = new Map<string, number>();

    await stubDefaults(page, calls);

    const stub: RegistryStub = {
      on: async (pattern, body, status = 200) => {
        await page.route(pattern, (route: Route) =>
          route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(body),
          }),
        );
      },
      callsTo: (pattern) => calls.get(pattern) ?? 0,
    };

    await use(stub);
  },

  signedIn: async ({ page, registry }, use) => {
    void registry;
    await page.goto('/sign-in');
    await page.getByLabel('Username').fill('h.whitcombe');
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expectVisible(page, SESSION.displayName);
    await use(page);
  },
});

async function expectVisible(page: Page, text: string): Promise<void> {
  await page.getByText(text).waitFor({ state: 'visible' });
}

async function stubDefaults(page: Page, calls: Map<string, number>): Promise<void> {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api', '');
    calls.set(path, (calls.get(path) ?? 0) + 1);

    const body = defaultFor(path, route.request().method());
    if (body === undefined) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://errors.slipgauge.internal/registry/not-found',
          title: 'NOT_FOUND',
          status: 404,
          detail: `nothing stubbed for ${path}`,
          code: 'registry/not-found',
          timestamp: new Date().toISOString(),
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

function defaultFor(path: string, method: string): unknown {
  if (path === '/auth/token' && method === 'POST') {
    return SESSION;
  }
  if (path === '/reference/classes') {
    return CLASSES;
  }
  if (path === '/reference/locations') {
    return LOCATIONS;
  }
  if (path === '/instruments') {
    return page1([instrument(1, 'SG-000101'), instrument(2, 'SG-000102')]);
  }
  if (path === '/recalls' || path === '/recalls/unscheduled' || path === '/impact') {
    return [];
  }
  if (path === '/recalls/summary') {
    return { horizonDays: 120, overdue: 0, unscheduled: 0, byStanding: {} };
  }
  return undefined;
}

/** A token with a real payload so the console can read the expiry out of it. */
function signedToken(expiresAtSeconds: number): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'h.whitcombe', exp: expiresAtSeconds }),
  ).toString('base64url');
  return `stub.${payload}.signature`;
}

export { expect } from '@playwright/test';
