import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { InstrumentApiService } from '@core/api/instrument-api.service';
import { RegistryError } from '@core/errors/problem';
import { EMPTY_QUERY, InstrumentQuery, activeFilterCount } from '@core/models/instrument-query.model';
import { InstrumentSummary } from '@core/models/instrument.model';
import { Page, emptyPage, pageSummary } from '@core/models/page.model';
import { environment } from '../../../environments/environment';
import { RegisterView, paramsToView, sameView, viewToParams } from './query-url';

/**
 * Everything the register page needs to know, held as signals.
 *
 * <p>The store owns the request in flight as well as the result, because two
 * filter changes in quick succession used to land out of order and leave the
 * grid showing the older answer. Each load takes a ticket and only the newest
 * ticket is allowed to write.
 */
@Injectable()
export class RegisterStore {
  private readonly api = inject(InstrumentApiService);
  private readonly router = inject(Router);

  private readonly pageState = signal<Page<InstrumentSummary>>(
    emptyPage(environment.registerPageSize),
  );
  private readonly queryState = signal<InstrumentQuery>(EMPTY_QUERY);
  private readonly sortState = signal<string>('assetTag');
  private readonly loadingState = signal(false);
  private readonly errorState = signal<RegistryError | null>(null);
  private readonly selectedState = signal<ReadonlySet<number>>(new Set());

  private ticket = 0;

  readonly page = this.pageState.asReadonly();
  readonly query = this.queryState.asReadonly();
  readonly sort = this.sortState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly selected = this.selectedState.asReadonly();

  readonly rows = computed(() => this.pageState().items);
  readonly summary = computed(() => pageSummary(this.pageState()));
  readonly filterCount = computed(() => activeFilterCount(this.queryState()));
  readonly isEmpty = computed(() => !this.loadingState() && this.pageState().totalItems === 0);
  readonly selectionCount = computed(() => this.selectedState().size);
  readonly selectedRows = computed(() => {
    const selected = this.selectedState();
    return this.rows().filter((row) => selected.has(row.id));
  });
  readonly allOnPageSelected = computed(() => {
    const rows = this.rows();
    const selected = this.selectedState();
    return rows.length > 0 && rows.every((row) => selected.has(row.id));
  });

  /**
   * Adopts the view carried in the address bar. Called once when the page
   * opens; after that the store is the one writing to the address rather than
   * reading from it, so a back button gives the previous filter set rather
   * than fighting the grid.
   */
  adopt(params: Record<string, unknown>): void {
    const view = paramsToView(params);
    this.queryState.set(view.query);
    this.sortState.set(view.sort);
    this.load(view.page, false);
  }

  currentView(): RegisterView {
    return {
      query: this.queryState(),
      page: this.pageState().page,
      sort: this.sortState(),
    };
  }

  private publish(page: number): void {
    const view: RegisterView = {
      query: this.queryState(),
      page,
      sort: this.sortState(),
    };
    if (sameView(view, this.lastPublished)) {
      return;
    }
    this.lastPublished = view;
    void this.router.navigate([], {
      queryParams: viewToParams(view),
      replaceUrl: true,
    });
  }

  private lastPublished: RegisterView = { query: EMPTY_QUERY, page: 0, sort: 'assetTag' };

  load(page = 0, publish = true): void {
    if (publish) {
      this.publish(page);
    }
    const mine = ++this.ticket;
    this.loadingState.set(true);
    this.errorState.set(null);

    this.api
      .search(this.queryState(), page, environment.registerPageSize, this.sortState())
      .subscribe({
        next: (result) => {
          if (mine !== this.ticket) {
            return;
          }
          this.pageState.set(result);
          this.loadingState.set(false);
        },
        error: (error: RegistryError) => {
          if (mine !== this.ticket) {
            return;
          }
          this.errorState.set(error);
          this.loadingState.set(false);
        },
      });
  }

  applyQuery(query: InstrumentQuery): void {
    this.queryState.set(query);
    this.clearSelection();
    this.load(0);
  }

  clearFilters(): void {
    this.applyQuery(EMPTY_QUERY);
  }

  /** Clicking the column already sorted flips it rather than reapplying it. */
  sortBy(column: string): void {
    const current = this.sortState();
    this.sortState.set(current === column ? `-${column}` : column);
    this.load(0);
  }

  directionFor(column: string): 'asc' | 'desc' | null {
    const current = this.sortState();
    if (current === column) {return 'asc';}
    if (current === `-${column}`) {return 'desc';}
    return null;
  }

  goToPage(page: number): void {
    const total = this.pageState().totalPages;
    if (page < 0 || (total > 0 && page >= total)) {
      return;
    }
    this.load(page);
  }

  next(): void {
    if (!this.pageState().last) {
      this.goToPage(this.pageState().page + 1);
    }
  }

  previous(): void {
    if (!this.pageState().first) {
      this.goToPage(this.pageState().page - 1);
    }
  }

  toggleSelection(id: number): void {
    const next = new Set(this.selectedState());
    if (!next.delete(id)) {
      next.add(id);
    }
    this.selectedState.set(next);
  }

  toggleAllOnPage(): void {
    if (this.allOnPageSelected()) {
      this.clearSelection();
      return;
    }
    this.selectedState.set(new Set(this.rows().map((row) => row.id)));
  }

  clearSelection(): void {
    this.selectedState.set(new Set());
  }
}
