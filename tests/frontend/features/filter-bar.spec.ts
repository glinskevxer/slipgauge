import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { FilterBarComponent } from '@features/register/filter-bar.component';
import { InstrumentQuery } from '@core/models/instrument-query.model';

describe('FilterBarComponent', () => {
  let fixture: ComponentFixture<FilterBarComponent>;
  let component: FilterBarComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilterBarComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FilterBarComponent);
    fixture.componentRef.setInput('applied', {} as InstrumentQuery);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.match(() => true).forEach((request) => request.flush([]));
    http.verify();
  });

  /** Reaches the protected signals the way the template does. */
  function state(): Record<string, { set: (value: unknown) => void }> {
    return component as unknown as Record<string, { set: (value: unknown) => void }>;
  }

  it('builds an empty query when nothing has been typed', () => {
    expect(component.build()).toEqual({});
  });

  it('trims the free text and leaves a blank search out', () => {
    state()['text'].set('   ');
    expect(component.build()).toEqual({});

    state()['text'].set('  mitutoyo  ');
    expect(component.build()).toEqual({ text: 'mitutoyo' });
  });

  it('collects the chips that are switched on', () => {
    const protectedApi = component as unknown as {
      toggleStatus: (value: string) => void;
      toggleDiscipline: (value: string) => void;
    };
    protectedApi.toggleStatus('IN_SERVICE');
    protectedApi.toggleStatus('QUARANTINED');
    protectedApi.toggleDiscipline('MASS');

    expect(component.build()).toEqual({
      statuses: ['IN_SERVICE', 'QUARANTINED'],
      disciplines: ['MASS'],
    });
  });

  it('switches a chip back off when it is clicked twice', () => {
    const protectedApi = component as unknown as { toggleStatus: (value: string) => void };
    protectedApi.toggleStatus('ON_LOAN');
    protectedApi.toggleStatus('ON_LOAN');

    expect(component.build()).toEqual({});
  });

  it('only sends the boolean flags when they are on', () => {
    state()['referenceOnly'].set(true);
    expect(component.build()).toEqual({ referenceOnly: true });
  });

  it('refuses to emit while the date range runs backwards', () => {
    const emitted: InstrumentQuery[] = [];
    component.search.subscribe((query) => emitted.push(query));

    state()['acquiredFrom'].set('2025-06-01');
    state()['acquiredTo'].set('2025-01-01');
    (component as unknown as { apply: () => void }).apply();

    expect(emitted).toHaveLength(0);
  });

  it('emits once the range is the right way round', () => {
    const emitted: InstrumentQuery[] = [];
    component.search.subscribe((query) => emitted.push(query));

    state()['acquiredFrom'].set('2025-01-01');
    state()['acquiredTo'].set('2025-06-01');
    (component as unknown as { apply: () => void }).apply();

    expect(emitted).toEqual([{ acquiredFrom: '2025-01-01', acquiredTo: '2025-06-01' }]);
  });

  it('clearing wipes every field and tells the page', () => {
    let resetCount = 0;
    component.cleared.subscribe(() => (resetCount += 1));

    state()['text'].set('caliper');
    state()['referenceOnly'].set(true);
    (component as unknown as { clear: () => void }).clear();

    expect(component.build()).toEqual({});
    expect(resetCount).toBe(1);
  });

  it('fetches the class and location lookups once on creation', () => {
    expect(http.match((request) => request.url.endsWith('/reference/classes'))).toHaveLength(1);
    expect(http.match((request) => request.url.endsWith('/reference/locations'))).toHaveLength(1);
  });
});
