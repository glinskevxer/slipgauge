import {
  Authorisation,
  AuthorisationRequest,
  RefusalReason,
  coverage,
  decide,
  expiringWithin,
  levelOn,
  specificity,
} from '@registry/competence/authorisation';
import {
  CompetenceLevel,
  highestLevel,
  levelLabel,
  levelReaches,
  rankOf,
} from '@registry/competence/competence-level';

function held(overrides: Partial<Authorisation> = {}): Authorisation {
  return {
    id: 1,
    person: 'r.okonjo',
    discipline: 'DIMENSIONAL',
    classId: null,
    level: CompetenceLevel.AUTHORISED,
    rangeLow: null,
    rangeHigh: null,
    authorisedFrom: '2025-01-01',
    authorisedTo: '2026-12-31',
    withdrawn: false,
    ...overrides,
  };
}

function asking(overrides: Partial<AuthorisationRequest> = {}): AuthorisationRequest {
  return {
    person: 'r.okonjo',
    discipline: 'DIMENSIONAL',
    classId: 4,
    level: CompetenceLevel.AUTHORISED,
    upTo: null,
    on: '2025-11-20',
    ...overrides,
  };
}

describe('competence levels', () => {
  it('orders a trainee under an authorised technician under an approver', () => {
    expect(rankOf(CompetenceLevel.TRAINEE)).toBeLessThan(rankOf(CompetenceLevel.AUTHORISED));
    expect(rankOf(CompetenceLevel.AUTHORISED)).toBeLessThan(rankOf(CompetenceLevel.APPROVER));
  });

  it('lets a higher level do everything a lower one can', () => {
    expect(levelReaches(CompetenceLevel.APPROVER, CompetenceLevel.AUTHORISED)).toBe(true);
    expect(levelReaches(CompetenceLevel.AUTHORISED, CompetenceLevel.AUTHORISED)).toBe(true);
    expect(levelReaches(CompetenceLevel.TRAINEE, CompetenceLevel.AUTHORISED)).toBe(false);
  });

  it('picks the highest of a set, and nothing out of an empty one', () => {
    expect(highestLevel([CompetenceLevel.TRAINEE, CompetenceLevel.APPROVER])).toBe(
      CompetenceLevel.APPROVER,
    );
    expect(highestLevel([])).toBeNull();
  });

  it('says what a level means rather than what it is called', () => {
    expect(levelLabel(CompetenceLevel.TRAINEE)).toBe('under supervision');
    expect(levelLabel(CompetenceLevel.APPROVER)).toBe('authorised to approve');
  });
});

describe('whether one authorisation covers a request', () => {
  it('covers a discipline wide grant', () => {
    expect(coverage(held(), asking())).toBeNull();
  });

  it('does not cover somebody else, or another discipline', () => {
    expect(coverage(held(), asking({ person: 'a.pereira' }))).toBe(RefusalReason.NOTHING_HELD);
    expect(coverage(held(), asking({ discipline: 'TORQUE' }))).toBe(RefusalReason.NOTHING_HELD);
  });

  it('does not cover a different class when the grant names one', () => {
    expect(coverage(held({ classId: 9 }), asking({ classId: 4 }))).toBe(
      RefusalReason.NOTHING_HELD,
    );
    expect(coverage(held({ classId: 4 }), asking({ classId: 4 }))).toBeNull();
  });

  it('reads a withdrawn grant as withdrawn even when it also ran out', () => {
    const gone = held({ withdrawn: true, authorisedTo: '2025-06-30' });

    expect(coverage(gone, asking())).toBe(RefusalReason.WITHDRAWN);
  });

  it('knows the difference between not yet and no longer', () => {
    expect(coverage(held({ authorisedFrom: '2026-01-01' }), asking())).toBe(
      RefusalReason.NOT_YET,
    );
    expect(coverage(held({ authorisedTo: '2025-06-30' }), asking())).toBe(RefusalReason.EXPIRED);
  });

  it('treats an open ended grant as never running out', () => {
    expect(coverage(held({ authorisedTo: null }), asking({ on: '2099-01-01' }))).toBeNull();
  });

  it('refuses a level below what was asked for', () => {
    expect(
      coverage(held({ level: CompetenceLevel.AUTHORISED }), asking({ level: CompetenceLevel.APPROVER })),
    ).toBe(RefusalReason.LEVEL_TOO_LOW);
  });

  it('refuses work past the top of a bounded span', () => {
    const bounded = held({ rangeLow: 0, rangeHigh: 100 });

    expect(coverage(bounded, asking({ upTo: 100 }))).toBeNull();
    expect(coverage(bounded, asking({ upTo: 101 }))).toBe(RefusalReason.OUTSIDE_RANGE);
  });

  it('refuses work below the bottom of a bounded span', () => {
    expect(coverage(held({ rangeLow: 50, rangeHigh: 100 }), asking({ upTo: 20 }))).toBe(
      RefusalReason.OUTSIDE_RANGE,
    );
  });

  it('ignores the span when the work does not say how far it reaches', () => {
    expect(coverage(held({ rangeLow: 0, rangeHigh: 10 }), asking({ upTo: null }))).toBeNull();
  });
});

describe('how specific an authorisation is', () => {
  it('ranks a class and span grant above a class one above a bare discipline', () => {
    expect(specificity(held({ classId: 4, rangeHigh: 25, rangeLow: 0 }))).toBe(3);
    expect(specificity(held({ classId: 4 }))).toBe(2);
    expect(specificity(held({ rangeLow: 0, rangeHigh: 25 }))).toBe(1);
    expect(specificity(held())).toBe(0);
  });
});

describe('deciding across everything a person holds', () => {
  it('allows as soon as one grant covers it', () => {
    const decision = decide(
      [held({ id: 1, discipline: 'TORQUE' }), held({ id: 2 })],
      asking(),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.granted?.id).toBe(2);
  });

  it('prefers the most specific grant when several cover it', () => {
    const decision = decide(
      [held({ id: 1 }), held({ id: 2, classId: 4, rangeLow: 0, rangeHigh: 25 })],
      asking({ upTo: 20 }),
    );

    expect(decision.granted?.id).toBe(2);
  });

  it('says nothing is held when there is genuinely nothing', () => {
    const decision = decide([held({ discipline: 'TORQUE' })], asking());

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(RefusalReason.NOTHING_HELD);
    expect(decision.detail).toBe('r.okonjo holds nothing for dimensional');
  });

  it('quotes the near miss rather than saying nothing is held', () => {
    const decision = decide([held({ authorisedTo: '2025-06-30' })], asking());

    expect(decision.reason).toBe(RefusalReason.EXPIRED);
    expect(decision.detail).toContain('ran out on 2025-06-30');
  });

  it('explains a level that is too low in both directions', () => {
    const decision = decide(
      [held({ level: CompetenceLevel.TRAINEE })],
      asking({ level: CompetenceLevel.AUTHORISED }),
    );

    expect(decision.detail).toBe('r.okonjo is trainee and this needs authorised');
  });

  it('explains a span that does not reach', () => {
    const decision = decide([held({ rangeLow: 0, rangeHigh: 100 })], asking({ upTo: 400 }));

    expect(decision.detail).toBe('r.okonjo is authorised from 0 to 100, this reaches 400');
  });

  it('describes the grant it allowed under', () => {
    const decision = decide([held({ classId: 4, rangeLow: 0, rangeHigh: 25 })], asking());

    expect(decision.detail).toBe('r.okonjo is authorised for class 4 from 0 to 25');
  });

  it('allows on a later grant even when an earlier one has lapsed', () => {
    const decision = decide(
      [
        held({ id: 1, authorisedFrom: '2024-01-01', authorisedTo: '2025-06-30' }),
        held({ id: 2, authorisedFrom: '2025-07-01', authorisedTo: '2026-06-30' }),
      ],
      asking(),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.granted?.id).toBe(2);
  });
});

describe('the highest level somebody can work at', () => {
  it('is the top level any grant reaches', () => {
    expect(
      levelOn([held({ level: CompetenceLevel.APPROVER })], 'r.okonjo', 'DIMENSIONAL', 4, '2025-11-20'),
    ).toBe(CompetenceLevel.APPROVER);
  });

  it('drops to nothing once every grant has lapsed', () => {
    expect(
      levelOn([held({ authorisedTo: '2025-06-30' })], 'r.okonjo', 'DIMENSIONAL', 4, '2025-11-20'),
    ).toBeNull();
  });

  it('is the trainee level when that is all they hold', () => {
    expect(
      levelOn([held({ level: CompetenceLevel.TRAINEE })], 'r.okonjo', 'DIMENSIONAL', 4, '2025-11-20'),
    ).toBe(CompetenceLevel.TRAINEE);
  });
});

describe('what is about to run out', () => {
  it('lists the soonest first', () => {
    const expiring = expiringWithin(
      [
        held({ id: 1, authorisedTo: '2026-02-28' }),
        held({ id: 2, authorisedTo: '2026-01-15' }),
        held({ id: 3, authorisedTo: '2027-01-01' }),
      ],
      '2025-11-20',
      '2026-05-20',
    );

    expect(expiring.map((row) => row.id)).toEqual([2, 1]);
  });

  it('leaves out the open ended and the withdrawn', () => {
    const expiring = expiringWithin(
      [
        held({ id: 1, authorisedTo: null }),
        held({ id: 2, authorisedTo: '2026-01-15', withdrawn: true }),
      ],
      '2025-11-20',
      '2026-05-20',
    );

    expect(expiring).toHaveLength(0);
  });
});
