import { AcceptancePolicy } from '@registry/calibration/conformity/acceptance-policy';
import {
  accreditationStatement,
  customerCarriesRisk,
  decisionRuleStatement,
  statementsFor,
} from '@registry/calibration/conformity/decision-rule';

describe('the decision rule sentence', () => {
  it('says what simple acceptance costs the customer', () => {
    const text = decisionRuleStatement(AcceptancePolicy.SHARED_RISK);

    expect(text).toContain('no allowance for measurement uncertainty');
    expect(text).toContain('real risk of being outside it');
  });

  it('says what a stringent rule promises', () => {
    expect(decisionRuleStatement(AcceptancePolicy.STRINGENT)).toContain(
      'the whole expanded uncertainty',
    );
  });

  it('says how the managed risk guard band behaves', () => {
    const text = decisionRuleStatement(AcceptancePolicy.MANAGED_RISK);

    expect(text).toContain('narrows as the test uncertainty ratio improves');
  });

  it('falls back to the rule the laboratory quotes rather than to nothing', () => {
    expect(decisionRuleStatement('SOMETHING_NEW' as never)).toBe(
      decisionRuleStatement(AcceptancePolicy.MANAGED_RISK),
    );
  });

  it('is a different sentence for each rule', () => {
    const all = [
      decisionRuleStatement(AcceptancePolicy.SHARED_RISK),
      decisionRuleStatement(AcceptancePolicy.STRINGENT),
      decisionRuleStatement(AcceptancePolicy.MANAGED_RISK),
    ];

    expect(new Set(all).size).toBe(3);
  });
});

describe('the accreditation sentence', () => {
  it('names the schedule line when there is one', () => {
    expect(accreditationStatement('UKAS-0001/12')).toContain('reference UKAS-0001/12');
  });

  it('says plainly that it is unaccredited when there is not', () => {
    const text = accreditationStatement(null);

    expect(text).toContain('outside the laboratory schedule');
    expect(text).toContain('unaccredited result');
  });
});

describe('both sentences together', () => {
  it('puts the rule first, because it changes what the verdicts mean', () => {
    const text = statementsFor(AcceptancePolicy.STRINGENT, 'UKAS-0001/12');

    expect(text.indexOf('stringent')).toBeLessThan(text.indexOf('schedule of accreditation'));
  });

  it('fits inside the column that holds it', () => {
    for (const policy of Object.values(AcceptancePolicy)) {
      expect(statementsFor(policy, 'UKAS-0001/12').length).toBeLessThanOrEqual(600);
      expect(statementsFor(policy, null).length).toBeLessThanOrEqual(600);
    }
  });
});

describe('who carries the risk', () => {
  it('is the customer only under simple acceptance', () => {
    expect(customerCarriesRisk(AcceptancePolicy.SHARED_RISK)).toBe(true);
    expect(customerCarriesRisk(AcceptancePolicy.STRINGENT)).toBe(false);
    expect(customerCarriesRisk(AcceptancePolicy.MANAGED_RISK)).toBe(false);
  });
});
