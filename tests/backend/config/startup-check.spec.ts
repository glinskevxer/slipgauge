import {
  MINIMUM_BCRYPT_ROUNDS,
  MINIMUM_SECRET_LENGTH,
  RuntimeSettings,
  checkIntervals,
  checkSettings,
  describeProblem,
  refusals,
  settingsBanner,
  warnings,
} from '@registry/config/startup-check';

function settings(overrides: Partial<RuntimeSettings> = {}): RuntimeSettings {
  return {
    nodeEnv: 'production',
    jwtSecret: 'a-real-signing-key-that-is-long-enough-to-be-one',
    bcryptRounds: 12,
    allowedOrigins: ['https://registry.slipgauge.internal'],
    demoEstate: false,
    passesBeforeExtension: 2,
    extensionStep: 0.15,
    failureFactor: 0.5,
    driftBrake: 0.7,
    accreditationRef: 'UKAS-0001',
    ...overrides,
  };
}

function settingsFor(overrides: Partial<RuntimeSettings>): string[] {
  return checkSettings(settings(overrides)).map((problem) => problem.setting);
}

describe('a deployment that is set up properly', () => {
  it('has nothing to say about it', () => {
    expect(checkSettings(settings())).toHaveLength(0);
  });
});

describe('the signing key', () => {
  it('refuses one that is too short, in any environment', () => {
    for (const nodeEnv of ['production', 'development']) {
      const problems = checkSettings(settings({ nodeEnv, jwtSecret: 'short' }));

      expect(problems[0].setting).toBe('REGISTRY_JWT_SECRET');
      expect(problems[0].fatal).toBe(true);
    }
  });

  it('takes one exactly at the floor', () => {
    expect(settingsFor({ jwtSecret: 'x'.repeat(MINIMUM_SECRET_LENGTH) })).not.toContain(
      'REGISTRY_JWT_SECRET',
    );
  });

  it('refuses a key that ships with the repository in production', () => {
    const shipped = 'local-development-signing-key-not-for-any-real-deployment';
    const problem = checkSettings(settings({ jwtSecret: shipped }))[0];

    expect(problem.fatal).toBe(true);
    expect(problem.detail).toContain('one of the examples');
  });

  it('only warns about it outside production, where it is the point', () => {
    const shipped = 'local-development-signing-key-not-for-any-real-deployment';
    const problem = checkSettings(settings({ nodeEnv: 'development', jwtSecret: shipped }))[0];

    expect(problem.fatal).toBe(false);
  });
});

describe('the other production rules', () => {
  it('refuses a work factor below the floor in production', () => {
    const problem = checkSettings(settings({ bcryptRounds: 4 }))[0];

    expect(problem.setting).toBe('REGISTRY_BCRYPT_ROUNDS');
    expect(problem.detail).toContain(String(MINIMUM_BCRYPT_ROUNDS));
    expect(problem.fatal).toBe(true);
  });

  it('lets a test run at a cheap work factor', () => {
    const problem = checkSettings(settings({ nodeEnv: 'test', bcryptRounds: 4 }))[0];

    expect(problem.fatal).toBe(false);
  });

  it('refuses a wildcard origin anywhere at all', () => {
    for (const nodeEnv of ['production', 'development']) {
      const problem = checkSettings(settings({ nodeEnv, allowedOrigins: ['*'] }))[0];

      expect(problem.setting).toBe('REGISTRY_ALLOWED_ORIGINS');
      expect(problem.fatal).toBe(true);
    }
  });

  it('refuses the demo laboratory in production and allows it elsewhere', () => {
    expect(settingsFor({ demoEstate: true })).toContain('REGISTRY_DEMO_ESTATE');
    expect(settingsFor({ nodeEnv: 'development', demoEstate: true })).not.toContain(
      'REGISTRY_DEMO_ESTATE',
    );
  });

  it('refuses an unset schedule reference in production', () => {
    expect(settingsFor({ accreditationRef: 'UNSET' })).toContain('LAB_ACCREDITATION_REF');
    expect(settingsFor({ nodeEnv: 'development', accreditationRef: 'UNSET' })).not.toContain(
      'LAB_ACCREDITATION_REF',
    );
  });
});

describe('the interval numbers, against each other', () => {
  it('refuses a target of one, because one pass is not evidence', () => {
    expect(checkIntervals(settings({ passesBeforeExtension: 1 }))[0].setting).toBe(
      'REGISTRY_INTERVAL_PASSES',
    );
  });

  it('refuses a step worth more than a failure takes off', () => {
    // Both numbers are inside the bounds the interval module enforces, and
    // together they let a failing instrument drift outwards.
    const problems = checkIntervals(settings({ extensionStep: 0.6, failureFactor: 0.5 }));

    expect(problems.map((problem) => problem.detail).join(' ')).toContain('drift outwards');
  });

  it('allows a step exactly at what a failure takes off', () => {
    expect(checkIntervals(settings({ extensionStep: 0.5, failureFactor: 0.5 }))).toHaveLength(0);
  });

  it('allows a gentle step against a heavy failure', () => {
    expect(checkIntervals(settings({ extensionStep: 0.15, failureFactor: 0.5 }))).toHaveLength(0);
  });

  it('refuses a brake at the tolerance itself', () => {
    expect(checkIntervals(settings({ driftBrake: 1 }))).not.toHaveLength(0);
    expect(checkIntervals(settings({ driftBrake: 0.9 }))).toHaveLength(0);
  });
});

describe('sorting the problems out', () => {
  it('separates what stops the boot from what does not', () => {
    const problems = checkSettings(
      settings({
        nodeEnv: 'development',
        jwtSecret: 'change-me-but-long-enough-to-pass-the-length',
        bcryptRounds: 4,
        allowedOrigins: ['*'],
      }),
    );

    expect(refusals(problems).map((p) => p.setting)).toEqual(['REGISTRY_ALLOWED_ORIGINS']);
    expect(warnings(problems).map((p) => p.setting)).toEqual(['REGISTRY_BCRYPT_ROUNDS']);
  });

  it('reads each one as something somebody can act on', () => {
    expect(describeProblem(checkSettings(settings({ demoEstate: true }))[0])).toBe(
      'REGISTRY_DEMO_ESTATE: the demo laboratory would be loaded into a real register',
    );
  });
});

describe('the banner', () => {
  it('carries the numbers that decide every recall date', () => {
    expect(settingsBanner(settings())).toBe(
      'env=production demo=false origins=1 bcrypt=12 interval=2/0.15/0.5/0.7 schedule=UKAS-0001',
    );
  });

  it('never carries the signing key or a connection string', () => {
    const banner = settingsBanner(
      settings({ jwtSecret: 'a-real-signing-key-that-is-long-enough-to-be-one' }),
    );

    expect(banner).not.toContain('signing');
    expect(banner).not.toContain('postgres');
  });
});
