import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { SessionService } from '@core/auth/session.service';
import { severityTone } from '@core/models/impact.model';
import { dueInWords } from '@core/models/recall.model';
import { BarChartComponent } from '@shared/charts/bar-chart.component';
import { DonutChartComponent } from '@shared/charts/donut-chart.component';
import { DashboardStore } from './dashboard.store';

@Component({
  selector: 'sg-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, BarChartComponent, DonutChartComponent],
  providers: [DashboardStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  protected readonly store = inject(DashboardStore);
  protected readonly session = inject(SessionService);

  protected readonly severityTone = severityTone;
  protected readonly dueInWords = dueInWords;

  ngOnInit(): void {
    this.store.load();
  }

  protected greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'Morning';
    }
    return hour < 18 ? 'Afternoon' : 'Evening';
  }
}
