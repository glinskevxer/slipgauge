import { Injectable, computed, inject, signal } from '@angular/core';

import { ImpactApiService } from '@core/api/impact-api.service';
import { RegistryError } from '@core/errors/problem';
import {
  ImpactDisposition,
  ImpactItemView,
  ImpactKind,
  ImpactView,
  byDepth,
  progress,
} from '@core/models/impact.model';

@Injectable()
export class ImpactStore {
  private readonly api = inject(ImpactApiService);

  private readonly openState = signal<readonly ImpactView[]>([]);
  private readonly selectedState = signal<ImpactView | null>(null);
  private readonly kindFilterState = signal<ReadonlySet<ImpactKind>>(new Set());
  private readonly pendingOnlyState = signal(false);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<RegistryError | null>(null);

  readonly assessments = this.openState.asReadonly();
  readonly selected = this.selectedState.asReadonly();
  readonly kindFilter = this.kindFilterState.asReadonly();
  readonly pendingOnly = this.pendingOnlyState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  readonly visibleItems = computed<readonly ImpactItemView[]>(() => {
    const assessment = this.selectedState();
    if (!assessment) {
      return [];
    }
    const kinds = this.kindFilterState();
    const pendingOnly = this.pendingOnlyState();
    return assessment.items.filter((item) => {
      if (pendingOnly && item.disposition !== 'PENDING') {
        return false;
      }
      return kinds.size === 0 || kinds.has(item.kind);
    });
  });

  readonly columns = computed(() => byDepth(this.visibleItems()));

  readonly progressPercent = computed(() => {
    const assessment = this.selectedState();
    return assessment ? progress(assessment) : 0;
  });

  readonly canClose = computed(() => {
    const assessment = this.selectedState();
    return assessment !== null && assessment.pendingCount === 0 && assessment.status !== 'CLOSED';
  });

  readonly caughtCertificates = computed(
    () => this.selectedState()?.items.filter((item) => item.kind === 'CERTIFICATE') ?? [],
  );

  loadOpen(): void {
    this.loadingState.set(true);
    this.api.open().subscribe({
      next: (assessments) => {
        this.openState.set(assessments);
        this.loadingState.set(false);
        if (!this.selectedState() && assessments.length > 0) {
          this.select(assessments[0].id);
        }
      },
      error: (error: RegistryError) => this.fail(error),
    });
  }

  select(id: number): void {
    this.api.byId(id).subscribe({
      next: (assessment) => this.selectedState.set(assessment),
      error: (error: RegistryError) => this.fail(error),
    });
  }

  dispose(itemId: number, disposition: ImpactDisposition, note?: string): void {
    const assessment = this.selectedState();
    if (!assessment) {
      return;
    }
    this.api.dispose(assessment.id, itemId, disposition, note).subscribe({
      next: (updated) => this.selectedState.set(updated),
      error: (error: RegistryError) => this.fail(error),
    });
  }

  close(by: string, conclusion: string): void {
    const assessment = this.selectedState();
    if (!assessment) {
      return;
    }
    this.api.close(assessment.id, by, conclusion).subscribe({
      next: (updated) => {
        this.selectedState.set(updated);
        this.loadOpen();
      },
      error: (error: RegistryError) => this.fail(error),
    });
  }

  withdrawCaught(reason: string): void {
    const assessment = this.selectedState();
    if (!assessment) {
      return;
    }
    this.api.withdrawCaught(assessment.id, reason).subscribe({
      next: () => this.select(assessment.id),
      error: (error: RegistryError) => this.fail(error),
    });
  }

  toggleKind(kind: ImpactKind): void {
    const next = new Set(this.kindFilterState());
    if (!next.delete(kind)) {
      next.add(kind);
    }
    this.kindFilterState.set(next);
  }

  togglePendingOnly(): void {
    this.pendingOnlyState.update((on) => !on);
  }

  private fail(error: RegistryError): void {
    this.errorState.set(error);
    this.loadingState.set(false);
  }
}
