import { ChangeDetectionStrategy, Component as NgComponent, computed, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  Component,
  Distribution,
  combinedStandard,
  contributions,
  coverageFactor,
  distributionLabel,
  effectiveDegreesOfFreedom,
  emptyComponent,
  expanded,
  managedGuardBand,
  ratioVerdict,
  standardUncertainty,
  testUncertaintyRatio,
} from './budget.model';

const DISTRIBUTIONS: readonly Distribution[] = [
  'RECTANGULAR',
  'NORMAL',
  'TRIANGULAR',
  'U_SHAPED',
];

/**
 * Building an uncertainty budget at the bench.
 *
 * <p>The panel exists to answer one question before a sheet is filed: is the
 * ratio good enough to state conformity. Everything on it is arranged around
 * that, which is why the dominant contribution is called out rather than left
 * to be worked out from a column of small numbers.
 */
@NgComponent({
  selector: 'sg-budget-builder',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './budget-builder.component.html',
  styleUrl: './budget-builder.component.scss',
})
export class BudgetBuilderComponent {
  readonly toleranceHalfWidth = input<number | null>(null);
  readonly unit = input('');
  readonly expandedChange = output<number>();

  protected readonly distributions = DISTRIBUTIONS;
  protected readonly distributionLabel = distributionLabel;
  protected readonly standardUncertainty = standardUncertainty;

  protected readonly components = signal<readonly Component[]>([
    { ...emptyComponent('Reference standard'), source: 'its certificate', distribution: 'NORMAL' },
    { ...emptyComponent('Resolution'), source: 'the display', distribution: 'RECTANGULAR' },
  ]);

  protected readonly combined = computed(() => combinedStandard(this.components()));
  protected readonly factor = computed(() => coverageFactor(this.components()));
  protected readonly expandedValue = computed(() => expanded(this.components()));
  protected readonly freedom = computed(() => effectiveDegreesOfFreedom(this.components()));
  protected readonly ranked = computed(() => contributions(this.components()));

  protected readonly ratio = computed(() =>
    testUncertaintyRatio(this.components(), this.toleranceHalfWidth()),
  );
  protected readonly verdict = computed(() => ratioVerdict(this.ratio()));
  protected readonly guardBand = computed(() =>
    managedGuardBand(this.components(), this.toleranceHalfWidth()),
  );

  protected readonly dominant = computed(() => {
    const top = this.ranked()[0];
    return top && top.share > 0.5 ? top : null;
  });

  protected readonly freedomLabel = computed(() => {
    const freedom = this.freedom();
    return Number.isFinite(freedom) ? freedom.toFixed(1) : 'unbounded';
  });

  protected readonly ratioLabel = computed(() => {
    const ratio = this.ratio();
    if (ratio === null) {
      return 'no tolerance to compare against';
    }
    return Number.isFinite(ratio) ? `${ratio.toFixed(1)} to 1` : 'unbounded';
  });

  protected readonly advice = computed(() => {
    switch (this.verdict()) {
      case 'unstatable':
        return 'The uncertainty is wider than the tolerance. Conformity cannot be stated at all, so either a better standard or more repeat readings are needed.';
      case 'guarded':
        return `The acceptance limits will be pulled in by ${this.guardBand().toPrecision(3)} ${this.unit()}, so a reading near the limit will come back marginal.`;
      case 'healthy':
        return 'Comfortable. No guard band will be applied under the managed policy.';
      default:
        return 'Enter the tolerance to see how the budget compares against it.';
    }
  });

  protected add(): void {
    this.components.update((current) => [...current, emptyComponent()]);
  }

  protected remove(key: string): void {
    this.components.update((current) => current.filter((entry) => entry.key !== key));
    this.expandedChange.emit(this.expandedValue());
  }

  protected update(key: string, change: Partial<Component>): void {
    this.components.update((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...change } : entry)),
    );
    this.expandedChange.emit(this.expandedValue());
  }

  protected shareOf(key: string): number {
    return this.ranked().find((entry) => entry.component.key === key)?.share ?? 0;
  }

  protected percent(share: number): string {
    return `${Math.round(share * 100)}%`;
  }

  protected use(): void {
    this.expandedChange.emit(this.expandedValue());
  }
}
