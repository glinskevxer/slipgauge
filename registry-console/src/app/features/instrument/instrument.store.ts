import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';

import { CalibrationApiService } from '@core/api/calibration-api.service';
import { InstrumentApiService } from '@core/api/instrument-api.service';
import { RecallApiService } from '@core/api/recall-api.service';
import { ChainNode, CertificateView, chainFaults, worstVerdict } from '@core/models/calibration.model';
import { RegistryError } from '@core/errors/problem';
import { InstrumentDetail, InstrumentStatus } from '@core/models/instrument.model';
import { IntervalSummary } from '@core/models/recall.model';

/**
 * Everything the instrument page shows. The three calls go out together
 * because the page is useless with only one of them, and staggering them made
 * the header jump twice while the history and the interval timeline landed.
 */
@Injectable()
export class InstrumentStore {
  private readonly instruments = inject(InstrumentApiService);
  private readonly calibrations = inject(CalibrationApiService);
  private readonly recalls = inject(RecallApiService);

  private readonly detailState = signal<InstrumentDetail | null>(null);
  private readonly historyState = signal<readonly CertificateView[]>([]);
  private readonly decisionsState = signal<readonly IntervalSummary[]>([]);
  private readonly chainState = signal<ChainNode | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<RegistryError | null>(null);

  readonly detail = this.detailState.asReadonly();
  readonly history = this.historyState.asReadonly();
  readonly decisions = this.decisionsState.asReadonly();
  readonly chain = this.chainState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  readonly latest = computed<CertificateView | null>(() => this.historyState()[0] ?? null);

  readonly currentInterval = computed<IntervalSummary | null>(
    () => this.decisionsState().find((decision) => decision.current) ?? null,
  );

  readonly chainFaultCount = computed(() => {
    const chain = this.chainState();
    return chain === null ? 0 : chainFaults(chain).length;
  });

  readonly hasFailedRecently = computed(() => {
    const latest = this.latest();
    return latest !== null && latest.asFoundVerdict === 'OUT_OF_TOLERANCE';
  });

  readonly worstOnLatest = computed(() => {
    const latest = this.latest();
    return latest ? worstVerdict(latest.points) : null;
  });

  /** Certificates oldest first, which is the order the drift chart plots in. */
  readonly historyForward = computed(() => [...this.historyState()].reverse());

  readonly canGoBackInService = computed(() => {
    const detail = this.detailState();
    return detail !== null && detail.status !== 'IN_SERVICE' && detail.status !== 'RETIRED';
  });

  load(id: number): void {
    this.loadingState.set(true);
    this.errorState.set(null);

    this.instruments.byId(id).subscribe({
      next: (detail) => this.loadRest(detail),
      error: (error: RegistryError) => this.fail(error),
    });
  }

  private loadRest(detail: InstrumentDetail): void {
    this.detailState.set(detail);
    forkJoin({
      history: this.calibrations.historyFor(detail.assetTag),
      decisions: this.recalls.decisions(detail.id),
    }).subscribe({
      next: ({ history, decisions }) => {
        this.historyState.set(history);
        this.decisionsState.set(decisions);
        this.loadingState.set(false);
      },
      error: (error: RegistryError) => this.fail(error),
    });

    // The chain is fetched on its own. It is the slowest of the three and the
    // page is perfectly usable without it, so it must not hold the rest up.
    this.instruments.chain(detail.id).subscribe({
      next: (chain) => this.chainState.set(chain),
      error: () => this.chainState.set(null),
    });
  }

  changeStatus(target: InstrumentStatus): void {
    const detail = this.detailState();
    if (!detail) {
      return;
    }
    this.instruments.changeStatus(detail.id, target).subscribe({
      next: (updated) => this.detailState.set(updated),
      error: (error: RegistryError) => this.errorState.set(error),
    });
  }

  reassess(): void {
    const detail = this.detailState();
    if (!detail) {
      return;
    }
    this.recalls.reassess(detail.id).subscribe({
      next: () => this.load(detail.id),
      error: (error: RegistryError) => this.errorState.set(error),
    });
  }

  private fail(error: RegistryError): void {
    this.errorState.set(error);
    this.loadingState.set(false);
  }
}
