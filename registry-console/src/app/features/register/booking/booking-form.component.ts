import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';

import { InstrumentApiService } from '@core/api/instrument-api.service';
import { ReferenceApiService } from '@core/api/reference-api.service';
import { RegistryError } from '@core/errors/problem';
import { InstrumentClassView, RegisterInstrumentRequest } from '@core/models/instrument.model';
import { NotificationService } from '@core/notifications/notification.service';
import {
  firstMessage,
  notInTheFuture,
  resolutionFitsSpan,
  spanOrdered,
  trimmedNotBlank,
} from '@shared/forms/validators';

/**
 * Goods inwards booking a new instrument into the register.
 *
 * <p>The asset tag is not on this form. It is allocated by the service, and
 * the earliest version of this screen let it be typed, which produced two
 * instruments carrying the same tag inside a fortnight.
 */
@Component({
  selector: 'sg-booking-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './booking-form.component.html',
  styleUrl: './booking-form.component.scss',
})
export class BookingFormComponent {
  private readonly builder = inject(FormBuilder);
  private readonly instruments = inject(InstrumentApiService);
  private readonly reference = inject(ReferenceApiService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly saving = signal(false);
  protected readonly serverProblem = signal<RegistryError | null>(null);

  protected readonly classes = toSignal(
    this.reference.classes().pipe(catchError(() => of([] as InstrumentClassView[]))),
    { initialValue: [] as readonly InstrumentClassView[] },
  );

  protected readonly locations = toSignal(
    this.reference.locations().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  protected readonly form: FormGroup = this.builder.group(
    {
      classCode: ['', [Validators.required]],
      manufacturer: ['', [Validators.required, Validators.maxLength(120), trimmedNotBlank]],
      model: ['', [Validators.required, Validators.maxLength(120), trimmedNotBlank]],
      serialNumber: ['', [Validators.required, Validators.maxLength(80), trimmedNotBlank]],
      description: ['', [Validators.maxLength(400)]],
      unit: ['', [Validators.required, Validators.maxLength(24)]],
      rangeLow: [null, [Validators.required]],
      rangeHigh: [null, [Validators.required]],
      resolution: [null, [Validators.required]],
      locationCode: [''],
      custodian: ['', [Validators.maxLength(120)]],
      referenceStandard: [false],
      acquiredOn: ['', [Validators.required, notInTheFuture]],
    },
    {
      validators: [
        spanOrdered('rangeLow', 'rangeHigh'),
        resolutionFitsSpan('rangeLow', 'rangeHigh', 'resolution'),
      ],
    },
  );

  /** The class the operator picked, so the form can show its recall regime. */
  protected readonly chosenClass = computed<InstrumentClassView | null>(() => {
    const code = this.classCodeSignal();
    return this.classes().find((entry) => entry.code === code) ?? null;
  });

  private readonly classCodeSignal = signal('');

  constructor() {
    this.form.get('classCode')?.valueChanges.subscribe((value: string) =>
      this.classCodeSignal.set(value ?? ''),
    );
  }

  protected messageFor(controlName: string): string | null {
    const control = this.form.get(controlName);
    if (!control || (!control.touched && !control.dirty)) {
      return null;
    }
    const serverMessage = this.serverProblem()?.fieldMessage(controlName);
    return serverMessage ?? firstMessage(control.errors);
  }

  protected get groupMessage(): string | null {
    if (!this.form.touched && !this.form.dirty) {
      return null;
    }
    return firstMessage(this.form.errors);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.serverProblem.set(null);

    this.instruments.register(this.toRequest()).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.notifications.success(
          `Booked in as ${created.assetTag}`,
          `${created.manufacturer} ${created.model}`,
        );
        void this.router.navigate(['/register', created.id]);
      },
      error: (error: RegistryError) => {
        this.saving.set(false);
        this.serverProblem.set(error);
        this.notifications.fromError(error, 'Booking the instrument in');
      },
    });
  }

  protected reset(): void {
    this.form.reset({ referenceStandard: false });
    this.serverProblem.set(null);
  }

  private toRequest(): RegisterInstrumentRequest {
    const raw = this.form.getRawValue() as Record<string, unknown>;
    return {
      classCode: String(raw['classCode']),
      manufacturer: String(raw['manufacturer']).trim(),
      model: String(raw['model']).trim(),
      serialNumber: String(raw['serialNumber']).trim(),
      description: raw['description'] ? String(raw['description']).trim() : null,
      unit: String(raw['unit']).trim(),
      rangeLow: Number(raw['rangeLow']),
      rangeHigh: Number(raw['rangeHigh']),
      resolution: Number(raw['resolution']),
      locationCode: raw['locationCode'] ? String(raw['locationCode']) : null,
      custodian: raw['custodian'] ? String(raw['custodian']).trim() : null,
      referenceStandard: Boolean(raw['referenceStandard']),
      acquiredOn: String(raw['acquiredOn']),
    };
  }
}
