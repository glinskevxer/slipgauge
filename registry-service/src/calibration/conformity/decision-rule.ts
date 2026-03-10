import { AcceptancePolicy } from './acceptance-policy';

/**
 * The sentence a certificate has to carry when it states conformity.
 *
 * <p>Written out here rather than typed on the sheet. A statement somebody
 * types is a statement that drifts from the rule the guard band was actually
 * computed with, and the two disagreeing is worse than neither being there.
 *
 * <p>The wording is deliberately plain. A customer's quality engineer reads
 * this to decide whether a pass means what they need it to mean, and the
 * standard's own phrasing does not help them do that.
 */
const STATEMENTS: Readonly<Record<AcceptancePolicy, string>> = {
  [AcceptancePolicy.SHARED_RISK]:
    'Conformity stated under simple acceptance. A reading inside the tolerance is ' +
    'reported as a pass with no allowance for measurement uncertainty, so a result ' +
    'close to a limit carries a real risk of being outside it.',
  [AcceptancePolicy.STRINGENT]:
    'Conformity stated under a stringent decision rule. The acceptance limits are ' +
    'pulled in by the whole expanded uncertainty, so a pass means the true value is ' +
    'inside tolerance at the stated level of confidence.',
  [AcceptancePolicy.MANAGED_RISK]:
    'Conformity stated under a managed risk decision rule. The acceptance limit is ' +
    'pulled in by a guard band that narrows as the test uncertainty ratio improves, ' +
    'and disappears once the ratio reaches the target.',
};

/** The accreditation sentence, which is a separate claim from the decision rule. */
const ACCREDITED =
  'This measurement falls inside the laboratory schedule of accreditation, reference {ref}.';

const NOT_ACCREDITED =
  'This measurement falls outside the laboratory schedule of accreditation and is ' +
  'reported as an unaccredited result.';

export function decisionRuleStatement(policy: AcceptancePolicy): string {
  return STATEMENTS[policy] ?? STATEMENTS[AcceptancePolicy.MANAGED_RISK];
}

export function accreditationStatement(scopeRef: string | null): string {
  return scopeRef === null ? NOT_ACCREDITED : ACCREDITED.replace('{ref}', scopeRef);
}

/**
 * Both sentences, in the order they read on the certificate. The decision rule
 * first because it changes what the verdicts mean, and the accreditation second
 * because it changes what the certificate is worth.
 */
export function statementsFor(policy: AcceptancePolicy, scopeRef: string | null): string {
  return `${decisionRuleStatement(policy)} ${accreditationStatement(scopeRef)}`;
}

/** True when the rule leaves the risk with the customer. */
export function customerCarriesRisk(policy: AcceptancePolicy): boolean {
  return policy === AcceptancePolicy.SHARED_RISK;
}
