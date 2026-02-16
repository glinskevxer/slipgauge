import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  ExcursionView,
  durationInWords,
  kindLabel,
  overshootInWords,
  severityLabel,
  severityTone,
} from '@core/models/environment.model';
import { CountTileComponent } from '@shared/components/count-tile.component';
import { EmptyStateComponent } from '@shared/components/empty-state.component';
import { EnvironmentStore } from './environment.store';

/**
 * What the rooms have been doing, and what that put in question.
 *
 * <p>The list is excursions rather than readings. Nobody wants four thousand
 * samples; they want the six times last month the room was not fit to work in,
 * and for each of those, the certificates that went out anyway.
 */
@Component({
  selector: 'sg-room-log',
  standalone: true,
  imports: [RouterLink, DatePipe, EmptyStateComponent, CountTileComponent],
  providers: [EnvironmentStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './room-log.component.html',
  styleUrl: './room-log.component.scss',
})
export class RoomLogComponent implements OnInit {
  protected readonly store = inject(EnvironmentStore);

  protected readonly finding = signal('');
  protected readonly withdrawReason = signal('');
  protected readonly now = new Date().toISOString();

  protected readonly kindLabel = kindLabel;
  protected readonly severityLabel = severityLabel;
  protected readonly severityTone = severityTone;
  protected readonly overshootInWords = overshootInWords;

  ngOnInit(): void {
    this.store.load();
  }

  protected duration(excursion: ExcursionView): string {
    return durationInWords(excursion, this.now);
  }

  protected assess(): void {
    this.store.assess(this.finding());
    this.finding.set('');
  }

  protected withdraw(): void {
    this.store.withdrawAffected(this.withdrawReason());
    this.withdrawReason.set('');
  }

  protected filterRoom(value: string): void {
    this.store.forRoom(value);
  }
}
