import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApiService, LocationRequest } from '@core/api/admin-api.service';
import { ReferenceApiService } from '@core/api/reference-api.service';
import { RegistryError } from '@core/errors/problem';
import { StorageLocationView } from '@core/models/instrument.model';
import { NotificationService } from '@core/notifications/notification.service';
import { buildTree, flatten, validParentsFor } from './location-tree.model';

@Component({
  selector: 'sg-location-admin',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './location-admin.component.html',
  styleUrl: './location-admin.component.scss',
})
export class LocationAdminComponent implements OnInit {
  private readonly reference = inject(ReferenceApiService);
  private readonly admin = inject(AdminApiService);
  private readonly notifications = inject(NotificationService);

  protected readonly locations = signal<readonly StorageLocationView[]>([]);
  protected readonly moving = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly newCode = signal('');
  protected readonly newName = signal('');
  protected readonly newSite = signal('');
  protected readonly newParent = signal('');

  protected readonly tree = computed(() => buildTree(this.locations()));
  protected readonly rows = computed(() => flatten(this.tree()));
  protected readonly siteCount = computed(() => this.tree().length);

  protected readonly canAdd = computed(
    () =>
      this.newCode().trim().length > 0 &&
      this.newName().trim().length > 0 &&
      this.newSite().trim().length > 0 &&
      !this.locations().some((entry) => entry.code === this.newCode().trim()),
  );

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.reference.locations().subscribe({
      next: (locations) => this.locations.set(locations),
      error: (error: RegistryError) =>
        this.notifications.fromError(error, 'Loading the site tree'),
    });
  }

  protected parentsFor(code: string): readonly string[] {
    return validParentsFor(this.tree(), code);
  }

  protected indent(depth: number): string {
    return `${depth * 1.25}rem`;
  }

  protected startMove(code: string): void {
    this.moving.set(code);
  }

  protected cancelMove(): void {
    this.moving.set(null);
  }

  protected moveTo(code: string, parentCode: string): void {
    this.saving.set(true);
    this.admin.reparent(code, parentCode || null).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.moving.set(null);
        this.locations.update((current) =>
          current.map((entry) => (entry.code === updated.code ? updated : entry)),
        );
        this.notifications.success(
          `${updated.code} moved`,
          updated.parentCode ? `Now under ${updated.parentCode}` : 'Now a site of its own',
        );
      },
      error: (error: RegistryError) => {
        this.saving.set(false);
        this.notifications.fromError(error, `Moving ${code}`);
      },
    });
  }

  protected add(): void {
    if (!this.canAdd() || this.saving()) {
      return;
    }
    this.saving.set(true);

    const request: LocationRequest = {
      code: this.newCode().trim().toUpperCase(),
      name: this.newName().trim(),
      site: this.newSite().trim().toUpperCase(),
      parentCode: this.newParent() || null,
    };

    this.admin.createLocation(request).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.locations.update((current) => [...current, created]);
        this.newCode.set('');
        this.newName.set('');
        this.newParent.set('');
        this.notifications.success(`${created.code} added`);
      },
      error: (error: RegistryError) => {
        this.saving.set(false);
        this.notifications.fromError(error, 'Adding the location');
      },
    });
  }
}
