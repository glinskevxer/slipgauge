/**
 * What a password has to look like, and when it stops being acceptable.
 *
 * <p>Written as a set of independent rules rather than one regular expression.
 * A regular expression that enforces four classes and a length is unreadable,
 * untestable one rule at a time, and cannot tell somebody which of the four
 * they missed. That last part is why passwords get written on monitors.
 *
 * <p>The rules are deliberately not the 2003 ones. Length beats composition,
 * so the floor is high and the classes required are low, and rotation is on a
 * long clock because forced monthly rotation demonstrably makes people pick
 * worse passwords.
 */

/** Long enough that composition rules stop mattering much. */
export const MINIMUM_LENGTH = 12;
export const MAXIMUM_LENGTH = 200;

/** How long a password stands before the register asks for a new one. */
export const ROTATION_DAYS = 365;

/** How long before that the console starts warning. */
export const WARN_WITHIN_DAYS = 21;

/**
 * Passwords the laboratory has actually found on the system, plus the shapes
 * every list starts with. Compared case insensitively and after stripping the
 * digits people put on the end.
 */
const KNOWN_BAD: readonly string[] = [
  'password',
  'slipgauge',
  'metrology',
  'calibration',
  'micrometer',
  'qwerty',
  'letmein',
  'changeme',
  'welcome',
];

export interface PasswordProblem {
  readonly rule: string;
  readonly detail: string;
}

function classesIn(password: string): number {
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
}

/** The password with trailing digits and the usual substitutions undone. */
export function normalise(password: string): string {
  return password
    .toLowerCase()
    .replace(/[0-9!]+$/, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/@/g, 'a');
}

/**
 * Everything wrong with a password, not the first thing.
 *
 * <p>The username check runs on the normalised form, so `r.okonjo2025` is
 * caught as well as `r.okonjo`. It is the single most common bad password on
 * any system that does not check for it.
 */
export function checkPassword(password: string, username: string): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  const folded = normalise(password);

  if (password.length < MINIMUM_LENGTH) {
    problems.push({
      rule: 'length',
      detail: `a password has to be at least ${MINIMUM_LENGTH} characters`,
    });
  }
  if (password.length > MAXIMUM_LENGTH) {
    problems.push({
      rule: 'length',
      detail: `a password cannot be longer than ${MAXIMUM_LENGTH} characters`,
    });
  }
  if (password.trim() !== password) {
    problems.push({
      rule: 'whitespace',
      detail: 'a password cannot start or end with a space',
    });
  }
  if (classesIn(password) < 2) {
    problems.push({
      rule: 'variety',
      detail: 'use at least two of lower case, upper case, digits and punctuation',
    });
  }
  const name = username.toLowerCase().replace(/[._-]/g, '');

  if (name.length > 2 && folded.replace(/[._-]/g, '').includes(name)) {
    problems.push({ rule: 'username', detail: 'a password cannot contain the username' });
  }
  if (KNOWN_BAD.some((bad) => folded.includes(bad))) {
    problems.push({
      rule: 'guessable',
      detail: 'that is on the list of passwords this laboratory has already found in use',
    });
  }
  if (/^(.)\1+$/.test(password)) {
    problems.push({ rule: 'guessable', detail: 'a password cannot be one character repeated' });
  }
  return problems;
}

export function passwordIsAcceptable(password: string, username: string): boolean {
  return checkPassword(password, username).length === 0;
}

/** Days a password has left before it has to be changed. Negative when it is up. */
export function daysLeftOn(setAt: Date, now: Date): number {
  const age = Math.floor((now.getTime() - setAt.getTime()) / 86_400_000);

  return ROTATION_DAYS - age;
}

export function mustChange(setAt: Date, now: Date): boolean {
  return daysLeftOn(setAt, now) <= 0;
}

export function shouldWarn(setAt: Date, now: Date): boolean {
  const left = daysLeftOn(setAt, now);

  return left > 0 && left <= WARN_WITHIN_DAYS;
}

/** How the remaining time reads on the sign in reply. */
export function rotationNotice(setAt: Date, now: Date): string | null {
  const left = daysLeftOn(setAt, now);

  if (left <= 0) {
    return 'Your password has expired and has to be changed before you can carry on.';
  }
  if (left > WARN_WITHIN_DAYS) {
    return null;
  }
  return `Your password expires in ${left} day${left === 1 ? '' : 's'}.`;
}
