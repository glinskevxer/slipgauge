export const environment = {
  production: false,
  apiBaseUrl: '/api',
  /** Rows fetched per page on the register grid before the user scrolls. */
  registerPageSize: 50,
  /** How long a cached lookup list stays warm, in milliseconds. */
  referenceDataTtlMs: 5 * 60 * 1000,
  featureFlags: {
    impactExplorer: true,
    capacityBoard: true,
  },
};
