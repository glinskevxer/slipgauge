/**
 * PostgreSQL numeric columns come back as strings, because a numeric can hold
 * more precision than a double can carry. Every one of them is read through
 * here, so the one place that decides how a stored decimal becomes a number is
 * this file rather than each entity remembering to do it.
 *
 * <p>The domain works in doubles. Tolerances run to nine decimal places and
 * uncertainties to nine significant figures, both of which a double holds
 * exactly enough of for a decision that is then recorded alongside its inputs.
 */
export const numericTransformer = {
  to(value: number | null | undefined): number | null {
    return value ?? null;
  },
  from(value: string | null): number | null {
    return value === null || value === undefined ? null : Number(value);
  },
};

/** The same, for a column that is never null. */
export const requiredNumericTransformer = {
  to(value: number): number {
    return value;
  },
  from(value: string): number {
    return Number(value);
  },
};

/**
 * Rounds to the precision a column actually holds, so a value written and read
 * back compares equal. Without it a computed tolerance limit that lands on a
 * tenth of a nanometre comes back a whisker different and a test comparing the
 * two fails for no reason anybody can see.
 */
export function toScale(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
