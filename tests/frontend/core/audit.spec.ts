import {
  AuditLine,
  describe as describeLine,
  groupRefusals,
  outcomeTone,
  suspicious,
} from '@core/models/audit.model';

function line(
  id: number,
  actor: string,
  action: string,
  occurredAt: string,
  overrides: Partial<AuditLine> = {},
): AuditLine {
  return {
    id,
    occurredAt,
    actor,
    action,
    subject: 'account',
    subjectId: '4',
    outcome: 'DENIED',
    detail: 'wrong password',
    correlation: 'c-abc123',
    ...overrides,
  };
}

describe('audit outcomes', () => {
  it('separates an allowed action from a refusal and a fault', () => {
    expect(outcomeTone('ALLOWED')).toBe('ok');
    expect(outcomeTone('DENIED')).toBe('warn');
    expect(outcomeTone('FAILED')).toBe('bad');
  });

  it('describes a line in one readable sentence', () => {
    expect(describeLine(line(1, 'r.okonjo', 'sign-in', '2025-12-15T09:00:00Z'))).toBe(
      'r.okonjo sign-in account 4 (denied)',
    );
  });

  it('leaves the outcome off when it was allowed', () => {
    expect(
      describeLine(
        line(1, 'r.okonjo', 'sign-in', '2025-12-15T09:00:00Z', { outcome: 'ALLOWED' }),
      ),
    ).toBe('r.okonjo sign-in account 4');
  });

  it('copes with a line that names no particular record', () => {
    expect(
      describeLine(
        line(1, 'r.okonjo', 'sign-in', '2025-12-15T09:00:00Z', {
          subjectId: null,
          outcome: 'ALLOWED',
        }),
      ),
    ).toBe('r.okonjo sign-in account');
  });
});

describe('grouping refusals', () => {
  const lines = [
    line(1, 'r.okonjo', 'sign-in', '2025-12-15T09:00:00Z'),
    line(2, 'r.okonjo', 'sign-in', '2025-12-15T09:00:20Z'),
    line(3, 'r.okonjo', 'sign-in', '2025-12-15T09:00:41Z'),
    line(4, 'd.ferreira', 'sign-in', '2025-12-15T11:14:00Z'),
    line(5, 'r.okonjo', 'change-password', '2025-12-15T14:02:00Z'),
  ];

  it('groups by the person and the action together', () => {
    expect(groupRefusals(lines)).toHaveLength(3);
  });

  it('counts the lines in each group', () => {
    const biggest = groupRefusals(lines)[0];

    expect(biggest.actor).toBe('r.okonjo');
    expect(biggest.action).toBe('sign-in');
    expect(biggest.count).toBe(3);
  });

  it('records the first and the last time in each group', () => {
    const biggest = groupRefusals(lines)[0];

    expect(biggest.first).toBe('2025-12-15T09:00:00Z');
    expect(biggest.last).toBe('2025-12-15T09:00:41Z');
  });

  it('orders the lines inside a group oldest first', () => {
    const shuffled = [lines[2], lines[0], lines[1]];

    expect(groupRefusals(shuffled)[0].lines.map((entry) => entry.id)).toEqual([1, 2, 3]);
  });

  it('puts the biggest group first', () => {
    expect(groupRefusals(lines).map((group) => group.count)).toEqual([3, 1, 1]);
  });

  it('breaks a tie on recency so the newest trouble is at the top', () => {
    const tied = [
      line(1, 'a.person', 'sign-in', '2025-12-15T09:00:00Z'),
      line(2, 'b.person', 'sign-in', '2025-12-15T15:00:00Z'),
    ];

    expect(groupRefusals(tied)[0].actor).toBe('b.person');
  });

  it('returns nothing at all for an empty log', () => {
    expect(groupRefusals([])).toEqual([]);
  });
});

describe('spotting the groups worth a look', () => {
  it('leaves a single mistyped password alone', () => {
    const groups = groupRefusals([line(1, 'r.okonjo', 'sign-in', '2025-12-15T09:00:00Z')]);

    expect(suspicious(groups)).toEqual([]);
  });

  it('flags a run of the same refusal', () => {
    const groups = groupRefusals([
      line(1, 'r.okonjo', 'sign-in', '2025-12-15T09:00:00Z'),
      line(2, 'r.okonjo', 'sign-in', '2025-12-15T09:00:20Z'),
      line(3, 'r.okonjo', 'sign-in', '2025-12-15T09:00:41Z'),
    ]);

    expect(suspicious(groups)).toHaveLength(1);
  });

  it('takes a threshold so a quiet lab can tighten it', () => {
    const groups = groupRefusals([
      line(1, 'r.okonjo', 'sign-in', '2025-12-15T09:00:00Z'),
      line(2, 'r.okonjo', 'sign-in', '2025-12-15T09:00:20Z'),
    ]);

    expect(suspicious(groups, 2)).toHaveLength(1);
    expect(suspicious(groups, 5)).toHaveLength(0);
  });
});
