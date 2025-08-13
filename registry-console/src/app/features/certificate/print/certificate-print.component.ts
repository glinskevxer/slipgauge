import { ChangeDetectionStrategy, Component, computed, effect, inject, input, numberAttribute, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { forkJoin, switchMap } from 'rxjs';

import { CalibrationApiService } from '@core/api/calibration-api.service';
import { InstrumentApiService } from '@core/api/instrument-api.service';
import { RegistryError } from '@core/errors/problem';
import { NotificationService } from '@core/notifications/notification.service';
import { PrintableCertificate, toPrintable } from './certificate-print.model';

/**
 * The certificate as it goes on paper.
 *
 * <p>Printed from the browser rather than rendered server side. The laboratory
 * issues a few hundred a year, always from a machine with the record open in
 * front of it, and a rendering service is a second thing to keep in step with
 * the required content list for no gain anybody could name.
 */
@Component({
  selector: 'sg-certificate-print',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './certificate-print.component.html',
  styleUrl: './certificate-print.component.scss',
})
export class CertificatePrintComponent {
  private readonly calibrations = inject(CalibrationApiService);
  private readonly instruments = inject(InstrumentApiService);
  private readonly notifications = inject(NotificationService);

  readonly id = input.required({ transform: numberAttribute });

  protected readonly printable = signal<PrintableCertificate | null>(null);
  protected readonly loading = signal(false);

  protected readonly readyToIssue = computed(
    () => (this.printable()?.missing.length ?? 1) === 0,
  );

  protected readonly withdrawn = computed(
    () => this.printable()?.certificate.live === false,
  );

  constructor() {
    effect(() => this.load(this.id()));
  }

  private load(id: number): void {
    this.loading.set(true);

    this.calibrations
      .byId(id)
      .pipe(
        switchMap((certificate) =>
          forkJoin({
            certificate: [certificate],
            instrument: this.instruments.byId(certificate.instrumentId),
          }),
        ),
      )
      .subscribe({
        next: ({ certificate, instrument }) => {
          this.printable.set(toPrintable(certificate, instrument));
          this.loading.set(false);
        },
        error: (error: RegistryError) => {
          this.loading.set(false);
          this.notifications.fromError(error, 'Loading the certificate');
        },
      });
  }

  protected print(): void {
    window.print();
  }
}
