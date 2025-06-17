import { Injectable, inject, signal } from '@angular/core';

import { RegistryHttpService } from '@core/api/registry-http.service';

export interface BuildInfo {
  readonly version: string;
  readonly laboratory: string;
  readonly startedAt: string;
  readonly uptimeSeconds: number;
}

/** The console's own version, replaced at build time by the release script. */
export const CONSOLE_VERSION = '1.0.0';

/**
 * Which service the console is actually talking to.
 *
 * <p>Asked for once, on the terminal settings screen, and shown next to the
 * console's own version. A mismatch between the two is the first thing worth
 * ruling out when somebody reports behaviour nobody else can reproduce.
 */
@Injectable({ providedIn: 'root' })
export class BuildInfoService {
  private readonly http = inject(RegistryHttpService);

  private readonly serviceState = signal<BuildInfo | null>(null);
  private readonly askedState = signal(false);

  readonly service = this.serviceState.asReadonly();
  readonly console = CONSOLE_VERSION;

  load(): void {
    if (this.askedState()) {
      return;
    }
    this.askedState.set(true);
    this.http.get<BuildInfo>('/build').subscribe({
      next: (info) => this.serviceState.set(info),
      error: () => this.serviceState.set(null),
    });
  }

  /** True when the two halves are not from the same release. */
  mismatched(): boolean {
    const service = this.serviceState();
    return service !== null && service.version !== CONSOLE_VERSION;
  }

  uptime(): string {
    const seconds = this.serviceState()?.uptimeSeconds ?? 0;
    if (seconds < 60) {
      return `${seconds} seconds`;
    }
    if (seconds < 3600) {
      return `${Math.floor(seconds / 60)} minutes`;
    }
    if (seconds < 86400) {
      return `${Math.floor(seconds / 3600)} hours`;
    }
    return `${Math.floor(seconds / 86400)} days`;
  }
}
