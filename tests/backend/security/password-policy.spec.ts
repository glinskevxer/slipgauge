import {
  MINIMUM_LENGTH,
  ROTATION_DAYS,
  WARN_WITHIN_DAYS,
  checkPassword,
  daysLeftOn,
  mustChange,
  normalise,
  passwordIsAcceptable,
  rotationNotice,
  shouldWarn,
} from '@registry/security/password-policy';

function rulesFor(password: string, username = 'r.okonjo'): string[] {
  return checkPassword(password, username).map((problem) => problem.rule);
}

describe('what a password has to look like', () => {
  it('accepts a long ordinary one', () => {
    expect(checkPassword('slipway harbour ledger', 'r.okonjo')).toHaveLength(0);
    expect(passwordIsAcceptable('slipway harbour ledger', 'r.okonjo')).toBe(true);
  });

  it('refuses one that is too short, however varied', () => {
    expect(rulesFor('Ab3$xY7!')).toContain('length');
  });

  it('takes exactly the minimum length', () => {
    const twelve = 'Trawlerbank1';

    expect(twelve).toHaveLength(MINIMUM_LENGTH);
    expect(rulesFor(twelve)).not.toContain('length');
  });

  it('refuses one that is absurdly long', () => {
    expect(rulesFor('a'.repeat(400))).toContain('length');
  });

  it('refuses one made of a single repeated character', () => {
    expect(rulesFor('aaaaaaaaaaaaaaa')).toContain('guessable');
  });

  it('refuses one with nothing but lower case letters', () => {
    expect(rulesFor('harbourledger')).toContain('variety');
  });

  it('takes two classes rather than demanding four', () => {
    expect(rulesFor('harbourledger7')).not.toContain('variety');
    expect(rulesFor('Harbourledger')).not.toContain('variety');
  });

  it('refuses leading or trailing space, which nobody can retype', () => {
    expect(rulesFor(' harbour ledger 7 ')).toContain('whitespace');
  });

  it('refuses the username, however it is dressed up', () => {
    expect(rulesFor('r.okonjo-2025')).toContain('username');
    expect(rulesFor('MyR0k0nj0Pass')).toContain('username');
  });

  it('does not refuse a short username that happens to appear', () => {
    expect(rulesFor('the ledger of harbours', 'ab')).not.toContain('username');
  });

  it('refuses what the laboratory has already found in use', () => {
    expect(rulesFor('Slipgauge2025')).toContain('guessable');
    expect(rulesFor('P4ssword!2025')).toContain('guessable');
    expect(rulesFor('Micrometer12')).toContain('guessable');
  });

  it('reports every problem rather than the first', () => {
    const problems = checkPassword('rokonjo', 'r.okonjo');

    expect(problems.length).toBeGreaterThan(1);
    expect(problems.map((problem) => problem.rule)).toEqual(
      expect.arrayContaining(['length', 'variety', 'username']),
    );
  });

  it('says which rule was broken in words somebody can act on', () => {
    expect(checkPassword('short', 'r.okonjo')[0].detail).toContain('at least 12 characters');
  });
});

describe('undoing the usual dressing up', () => {
  it('drops trailing digits and exclamation marks', () => {
    expect(normalise('Harbour2025!')).toBe('harbour');
  });

  it('undoes the common substitutions', () => {
    expect(normalise('P4ssw0rd')).toBe('password');
    expect(normalise('l3tm31n')).toBe('letmeln');
  });
});

describe('how long a password stands', () => {
  const setAt = new Date('2025-01-06T09:00:00Z');

  it('counts down from a year', () => {
    expect(daysLeftOn(setAt, new Date('2025-01-06T09:00:00Z'))).toBe(ROTATION_DAYS);
    expect(daysLeftOn(setAt, new Date('2025-07-05T09:00:00Z'))).toBe(ROTATION_DAYS - 180);
  });

  it('has to be changed once the year is up', () => {
    expect(mustChange(setAt, new Date('2025-12-31T09:00:00Z'))).toBe(false);
    expect(mustChange(setAt, new Date('2026-01-06T09:00:00Z'))).toBe(true);
    expect(mustChange(setAt, new Date('2026-03-01T09:00:00Z'))).toBe(true);
  });

  it('warns for the last three weeks and not before', () => {
    expect(shouldWarn(setAt, new Date('2025-12-01T09:00:00Z'))).toBe(false);
    expect(shouldWarn(setAt, new Date('2025-12-20T09:00:00Z'))).toBe(true);
    expect(shouldWarn(setAt, new Date('2026-02-01T09:00:00Z'))).toBe(false);
  });

  it('starts warning exactly at the window', () => {
    const at = new Date(setAt.getTime() + (ROTATION_DAYS - WARN_WITHIN_DAYS) * 86_400_000);

    expect(shouldWarn(setAt, at)).toBe(true);
  });

  it('has a sentence for each case, and nothing to say in the middle', () => {
    expect(rotationNotice(setAt, new Date('2025-06-01T09:00:00Z'))).toBeNull();
    expect(rotationNotice(setAt, new Date('2025-12-20T09:00:00Z'))).toContain('expires in');
    expect(rotationNotice(setAt, new Date('2026-06-01T09:00:00Z'))).toContain('has expired');
  });

  it('reads a single day without the s', () => {
    const at = new Date(setAt.getTime() + (ROTATION_DAYS - 1) * 86_400_000);

    expect(rotationNotice(setAt, at)).toBe('Your password expires in 1 day.');
  });
});
