/**
 * What the service checks about its own settings before it takes a request.
 *
 * <p>Every one of these has been wrong on a real deployment somewhere, and each
 * of them fails in a way that looks like something else: a bcrypt work factor
 * of four looks like a fast machine, an extension percentage of two hundred
 * looks like the interval engine being broken, and a shipped signing key looks
 * like nothing at all until somebody mints their own token.
 *
 * <p>Separate from the config module so the rules can be read and tested
 * without booting anything.
 */

export interface RuntimeSettings {
  readonly nodeEnv: string;
  readonly jwtSecret: string;
  readonly bcryptRounds: number;
  readonly allowedOrigins: readonly string[];
  readonly demoEstate: boolean;
  /** The interval policy, as the interval module already validates it. */
  readonly passesBeforeExtension: number;
  readonly extensionStep: number;
  readonly failureFactor: number;
  readonly driftBrake: number;
  readonly accreditationRef: string;
}

export interface SettingProblem {
  readonly setting: string;
  readonly detail: string;
  /** A refusal stops the boot. A warning is logged and the service carries on. */
  readonly fatal: boolean;
}

/** Anything shorter cannot carry the entropy a signing key needs. */
export const MINIMUM_SECRET_LENGTH = 32;

/** Below this, a stolen hash is worth brute forcing on a laptop. */
export const MINIMUM_BCRYPT_ROUNDS = 10;

/** Keys that have appeared in an example file and must never reach production. */
const SHIPPED_SECRETS = [
  'local-development-signing-key-not-for-any-real-deployment',
  'a-development-only-signing-key-nobody-should-deploy',
  'integration-test-signing-key-not-used-outside-the-suite',
  'change-me',
  'secret',
];

function isProduction(settings: RuntimeSettings): boolean {
  return settings.nodeEnv === 'production';
}

/**
 * Everything wrong with the settings, in the order somebody would fix them.
 *
 * <p>A rule that only bites in production is marked as such rather than being
 * skipped everywhere else: a developer seeing the warning locally is how it
 * gets fixed before the deployment rather than during it.
 */
export function checkSettings(settings: RuntimeSettings): SettingProblem[] {
  const problems: SettingProblem[] = [];
  const production = isProduction(settings);

  if (settings.jwtSecret.length < MINIMUM_SECRET_LENGTH) {
    problems.push({
      setting: 'REGISTRY_JWT_SECRET',
      detail: `a signing key has to be at least ${MINIMUM_SECRET_LENGTH} characters`,
      fatal: true,
    });
  }
  if (SHIPPED_SECRETS.includes(settings.jwtSecret)) {
    problems.push({
      setting: 'REGISTRY_JWT_SECRET',
      detail: 'that key is one of the examples that ship with the repository',
      fatal: production,
    });
  }
  if (settings.bcryptRounds < MINIMUM_BCRYPT_ROUNDS) {
    problems.push({
      setting: 'REGISTRY_BCRYPT_ROUNDS',
      detail: `${settings.bcryptRounds} rounds is below the floor of ${MINIMUM_BCRYPT_ROUNDS}`,
      fatal: production,
    });
  }
  if (settings.allowedOrigins.some((origin) => origin === '*')) {
    problems.push({
      setting: 'REGISTRY_ALLOWED_ORIGINS',
      detail: 'a wildcard origin lets any page on the internet call the register',
      fatal: true,
    });
  }
  if (production && settings.demoEstate) {
    problems.push({
      setting: 'REGISTRY_DEMO_ESTATE',
      detail: 'the demo laboratory would be loaded into a real register',
      fatal: true,
    });
  }
  if (production && settings.accreditationRef === 'UNSET') {
    problems.push({
      setting: 'LAB_ACCREDITATION_REF',
      detail: 'the schedule reference is printed on every certificate',
      fatal: true,
    });
  }

  problems.push(...checkIntervals(settings));
  return problems;
}

/**
 * The interval numbers, checked against each other.
 *
 * <p>The interval module already refuses each of them outside its own bounds.
 * What it cannot see is the combinations, and those are what go wrong: a single
 * extension step worth more than a failure takes off means an instrument that
 * keeps failing drifts outwards, which is precisely backwards, and every number
 * in it is inside its own range.
 */
export function checkIntervals(settings: RuntimeSettings): SettingProblem[] {
  const problems: SettingProblem[] = [];

  if (settings.passesBeforeExtension < 2) {
    problems.push({
      setting: 'REGISTRY_INTERVAL_PASSES',
      detail: 'one pass is not evidence, the target has to be at least two',
      fatal: true,
    });
  }
  if (settings.extensionStep > 1 - settings.failureFactor) {
    problems.push({
      setting: 'REGISTRY_INTERVAL_EXTENSION_STEP',
      detail:
        'one extension step is worth more than a failure takes off, so an instrument that ' +
        'keeps failing would drift outwards',
      fatal: true,
    });
  }
  if (settings.driftBrake >= 1) {
    problems.push({
      setting: 'REGISTRY_INTERVAL_DRIFT_BRAKE',
      detail: 'a brake at the tolerance itself never stops anything before it fails',
      fatal: true,
    });
  }
  return problems;
}

export function refusals(problems: readonly SettingProblem[]): readonly SettingProblem[] {
  return problems.filter((problem) => problem.fatal);
}

export function warnings(problems: readonly SettingProblem[]): readonly SettingProblem[] {
  return problems.filter((problem) => !problem.fatal);
}

/** How a problem reads in the log, which is where somebody will find it. */
export function describeProblem(problem: SettingProblem): string {
  return `${problem.setting}: ${problem.detail}`;
}

/**
 * The one line the service logs about itself on the way up.
 *
 * <p>No secret and no connection string. What is here is what somebody staring
 * at a container that is behaving oddly actually needs: which mode it thinks it
 * is in, and the four numbers that decide every recall date it will produce.
 */
export function settingsBanner(settings: RuntimeSettings): string {
  return [
    `env=${settings.nodeEnv}`,
    `demo=${settings.demoEstate}`,
    `origins=${settings.allowedOrigins.length}`,
    `bcrypt=${settings.bcryptRounds}`,
    `interval=${settings.passesBeforeExtension}/${settings.extensionStep}/` +
      `${settings.failureFactor}/${settings.driftBrake}`,
    `schedule=${settings.accreditationRef}`,
  ].join(' ');
}
