import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  Density,
  HORIZON_CHOICES,
  PAGE_SIZE_CHOICES,
  Theme,
} from '@core/preferences/preferences.model';
import { PreferencesService } from '@core/preferences/preferences.service';
import { BuildInfoService } from '@core/build-info';
import { NotificationService } from '@core/notifications/notification.service';

@Component({
  selector: 'sg-preferences-panel',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './preferences-panel.component.html',
  styleUrl: './preferences-panel.component.scss',
})
export class PreferencesPanelComponent implements OnInit {
  protected readonly preferences = inject(PreferencesService);
  protected readonly build = inject(BuildInfoService);
  private readonly notifications = inject(NotificationService);

  ngOnInit(): void {
    this.build.load();
  }

  protected readonly themes: ReadonlyArray<{ value: Theme; label: string }> = [
    { value: 'system', label: 'Follow the machine' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  protected readonly densities: ReadonlyArray<{ value: Density; label: string; hint: string }> = [
    {
      value: 'comfortable',
      label: 'Comfortable',
      hint: 'Room to read from a step back, which is how a bench terminal is used.',
    },
    {
      value: 'compact',
      label: 'Compact',
      hint: 'More rows on screen, for the office machines.',
    },
  ];

  protected readonly pageSizes = PAGE_SIZE_CHOICES;
  protected readonly horizons = HORIZON_CHOICES;

  protected readonly current = computed(() => this.preferences.preferences());

  protected setTheme(theme: Theme): void {
    this.preferences.set('theme', theme);
  }

  protected setDensity(density: Density): void {
    this.preferences.set('density', density);
  }

  protected setPageSize(size: number): void {
    this.preferences.set('pageSize', size);
  }

  protected setHorizon(days: number): void {
    this.preferences.set('recallHorizonDays', days);
  }

  protected setCapacity(hours: number): void {
    this.preferences.set('capacityHours', hours);
  }

  protected toggle(key: 'hideRetired' | 'warnUntraceableUse'): void {
    this.preferences.set(key, !this.current()[key]);
  }

  protected reset(): void {
    this.preferences.reset();
    this.notifications.info('Preferences put back to the defaults');
  }
}
