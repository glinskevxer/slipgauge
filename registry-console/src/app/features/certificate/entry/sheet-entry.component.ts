import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { RegistryHttpService } from '@core/api/registry-http.service';
import { RegistryError } from '@core/errors/problem';
import { AcceptancePolicy, CertificateView, StandardRole } from '@core/models/calibration.model';
import { NotificationService } from '@core/notifications/notification.service';
import {
  PointDraft,
  SheetDraft,
  SheetStep,
  STEP_ORDER,
  StandardDraft,
  StepProblem,
  emptyPoint,
  emptySheet,
  emptyStandard,
  isComplete,
  problemsFor,
  problemsIn,
  toRequest,
} from './sheet.model';

/**
 * Entering a calibration sheet, four steps at a time.
 *
 * <p>The bench works from a paper record and types the whole thing in one go,
 * so the wizard never blocks navigation between steps. It refuses only at the
 * point of filing, and shows every outstanding problem the whole way through.
 */
@Component({
  selector: 'sg-sheet-entry',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sheet-entry.component.html',
  styleUrl: './sheet-entry.component.scss',
})
export class SheetEntryComponent {
  private readonly http = inject(RegistryHttpService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly steps = STEP_ORDER;
  protected readonly stepLabels: Readonly<Record<SheetStep, string>> = {
    header: 'The certificate',
    standards: 'What it was measured against',
    points: 'The readings',
    review: 'Check and file',
  };

  protected readonly policies: ReadonlyArray<{ value: AcceptancePolicy; label: string }> = [
    { value: 'MANAGED_RISK', label: 'Managed risk (the usual)' },
    { value: 'STRINGENT', label: 'Stringent, guard band the whole uncertainty' },
    { value: 'SHARED_RISK', label: 'Shared risk, no guard band' },
  ];

  protected readonly roles: readonly StandardRole[] = ['REFERENCE', 'CHECK', 'ENVIRONMENT'];

  protected readonly draft = signal<SheetDraft>(emptySheet());
  protected readonly step = signal<SheetStep>('header');
  protected readonly filing = signal(false);
  protected readonly filed = signal<CertificateView | null>(null);

  protected readonly problems = computed(() => problemsIn(this.draft()));
  protected readonly complete = computed(() => isComplete(this.draft()));

  protected readonly stepIndex = computed(() => STEP_ORDER.indexOf(this.step()));
  protected readonly onFirstStep = computed(() => this.stepIndex() === 0);
  protected readonly onLastStep = computed(() => this.stepIndex() === STEP_ORDER.length - 1);

  protected readonly currentProblems = computed(() => problemsFor(this.draft(), this.step()));

  protected problemCount(step: SheetStep): number {
    return this.problems().filter((problem) => problem.step === step).length;
  }

  protected go(step: SheetStep): void {
    this.step.set(step);
  }

  protected next(): void {
    const index = this.stepIndex();
    if (index < STEP_ORDER.length - 1) {
      this.step.set(STEP_ORDER[index + 1]);
    }
  }

  protected back(): void {
    const index = this.stepIndex();
    if (index > 0) {
      this.step.set(STEP_ORDER[index - 1]);
    }
  }

  protected patch(change: Partial<SheetDraft>): void {
    this.draft.update((current) => ({ ...current, ...change }));
  }

  protected addPoint(): void {
    this.draft.update((current) => ({
      ...current,
      points: [...current.points, emptyPoint(nextSequence(current.points))],
    }));
  }

  protected removePoint(key: string): void {
    this.draft.update((current) => ({
      ...current,
      points:
        current.points.length === 1
          ? current.points
          : current.points.filter((point) => point.key !== key),
    }));
  }

  protected updatePoint(key: string, change: Partial<PointDraft>): void {
    this.draft.update((current) => ({
      ...current,
      points: current.points.map((point) =>
        point.key === key ? { ...point, ...change } : point,
      ),
    }));
  }

  protected addStandard(source: 'internal' | 'external'): void {
    this.draft.update((current) => ({
      ...current,
      standards: [...current.standards, emptyStandard(source)],
    }));
  }

  protected removeStandard(key: string): void {
    this.draft.update((current) => ({
      ...current,
      standards: current.standards.filter((entry) => entry.key !== key),
    }));
  }

  protected updateStandard(key: string, change: Partial<StandardDraft>): void {
    this.draft.update((current) => ({
      ...current,
      standards: current.standards.map((entry) =>
        entry.key === key ? { ...entry, ...change } : entry,
      ),
    }));
  }

  /**
   * Copies the as found column into as left. Most calibrations adjust nothing,
   * and typing the same eight numbers twice is where transcription errors come
   * from.
   */
  protected copyFoundToLeft(): void {
    this.draft.update((current) => ({
      ...current,
      points: current.points.map((point) => ({ ...point, asLeft: point.asFound })),
    }));
  }

  protected file(): void {
    if (!this.complete() || this.filing()) {
      return;
    }
    this.filing.set(true);

    this.http.post<CertificateView>('/certificates', toRequest(this.draft())).subscribe({
      next: (certificate) => {
        this.filing.set(false);
        this.filed.set(certificate);
        this.notifications.success(
          `Filed ${certificate.certificateNumber}`,
          `As found ${certificate.asFoundVerdict.toLowerCase().replace('_', ' ')}`,
        );
        void this.router.navigate(['/register', certificate.instrumentId]);
      },
      error: (error: RegistryError) => {
        this.filing.set(false);
        if (error.code === 'registry/traceability-broken') {
          this.step.set('standards');
          this.notifications.warning(
            'The traceability chain does not hold',
            error.message + '. Fix the standards or write an override reason.',
          );
          return;
        }
        this.notifications.fromError(error, 'Filing the certificate');
      },
    });
  }

  protected startAgain(): void {
    this.draft.set(emptySheet());
    this.step.set('header');
    this.filed.set(null);
  }

  protected trackProblem(_index: number, problem: StepProblem): string {
    return `${problem.step}:${problem.field}`;
  }
}

function nextSequence(points: readonly PointDraft[]): number {
  return points.reduce((highest, point) => Math.max(highest, point.sequenceNo), 0) + 1;
}
