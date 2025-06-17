import { Injectable, computed, effect, signal } from '@angular/core';

import {
  DEFAULTS,
  Preferences,
  densityClass,
  isDefault,
  sanitise,
  themeAttribute,
} from './preferences.model';

const STORAGE_KEY = 'slipgauge.preferences';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly state = signal<Preferences>(restore());

  readonly preferences = this.state.asReadonly();
  readonly theme = computed(() => this.state().theme);
  readonly density = computed(() => this.state().density);
  readonly pageSize = computed(() => this.state().pageSize);
  readonly customised = computed(() => !isDefault(this.state()));

  constructor() {
    effect(() => this.applyToDocument(this.state()));
  }

  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    this.replace({ ...this.state(), [key]: value });
  }

  replace(preferences: Preferences): void {
    const clean = sanitise(preferences);
    this.state.set(clean);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // A terminal with storage disabled simply forgets on reload.
    }
  }

  reset(): void {
    this.replace(DEFAULTS);
  }

  private applyToDocument(preferences: Preferences): void {
    const root = document.documentElement;
    const theme = themeAttribute(preferences.theme);
    if (theme) {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }

    root.classList.toggle('sg-compact', densityClass(preferences.density) !== '');
  }
}

function restore(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitise(JSON.parse(raw)) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
