import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  ImportLine,
  problemsFirst,
  summaryInWords,
  verdictLabel,
  verdictTone,
} from '@core/models/import.model';
import { CountTileComponent } from '@shared/components/count-tile.component';
import { ImportStore } from './import.store';

/**
 * Bringing a spreadsheet of instruments in.
 *
 * <p>Two buttons, and the second only lights up once the first has run. The
 * report opens on the rows that could not be read, because those are the only
 * ones anybody has to do anything about.
 */
@Component({
  selector: 'sg-instrument-import',
  standalone: true,
  imports: [CountTileComponent],
  providers: [ImportStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './instrument-import.component.html',
  styleUrl: './instrument-import.component.scss',
})
export class InstrumentImportComponent {
  protected readonly store = inject(ImportStore);

  protected readonly summaryInWords = summaryInWords;
  protected readonly verdictTone = verdictTone;

  protected lines(): readonly ImportLine[] {
    const report = this.store.report();

    return report === null ? [] : problemsFirst(report);
  }

  protected label(line: ImportLine): string {
    return verdictLabel(line.verdict, this.store.report()?.dryRun ?? true);
  }

  /** Reads the chosen file in the browser, so nothing is sent until it is read. */
  protected async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      this.store.clear();
      return;
    }
    this.store.take(file.name, await file.text());
  }
}
