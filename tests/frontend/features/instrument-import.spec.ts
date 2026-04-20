import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import {
  ImportLine,
  ImportReport,
  previewOf,
  problemsFirst,
  rowCount,
  summaryInWords,
  verdictLabel,
  verdictTone,
  worthCommitting,
} from '@core/models/import.model';
import { InstrumentImportComponent } from '@features/import/instrument-import.component';
import { ImportStore } from '@features/import/import.store';

function line(overrides: Partial<ImportLine> = {}): ImportLine {
  return {
    line: 2,
    verdict: 'NEW',
    describes: 'Mitutoyo 103-137, s/n 81104321',
    assetTag: null,
    problems: [],
    ...overrides,
  };
}

function report(overrides: Partial<ImportReport> = {}): ImportReport {
  const lines = overrides.lines ?? [line()];

  return {
    dryRun: true,
    lines,
    created: lines.filter((row) => row.verdict === 'NEW').length,
    duplicates: lines.filter((row) => row.verdict === 'DUPLICATE').length,
    rejected: lines.filter((row) => row.verdict === 'REJECTED').length,
    ...overrides,
  };
}

const FILE = 'classCode,manufacturer\r\nMIC-EXT,Mitutoyo\r\nMIC-EXT,Tesa\r\n';

describe('import labels', () => {
  it('uses different words before and after the import', () => {
    expect(verdictLabel('NEW', true)).toBe('Would be added');
    expect(verdictLabel('NEW', false)).toBe('Added');
    expect(verdictLabel('REJECTED', true)).toBe('Cannot be added');
    expect(verdictLabel('REJECTED', false)).toBe('Left out');
  });

  it('says the same thing about a duplicate either way', () => {
    expect(verdictLabel('DUPLICATE', true)).toBe('Already held');
    expect(verdictLabel('DUPLICATE', false)).toBe('Already held');
  });

  it('colours the verdicts', () => {
    expect(verdictTone('NEW')).toBe('ok');
    expect(verdictTone('DUPLICATE')).toBe('quiet');
    expect(verdictTone('REJECTED')).toBe('bad');
  });
});

describe('reading the file in the browser', () => {
  it('shows the header and the first few rows', () => {
    expect(previewOf(FILE, 1)).toEqual(['classCode,manufacturer', 'MIC-EXT,Mitutoyo']);
  });

  it('eats the byte order mark', () => {
    expect(previewOf(`﻿${FILE}`, 1)[0]).toBe('classCode,manufacturer');
  });

  it('counts the rows without the header', () => {
    expect(rowCount(FILE)).toBe(2);
    expect(rowCount('classCode\r\n')).toBe(0);
    expect(rowCount('')).toBe(0);
  });
});

describe('the report', () => {
  it('opens on the rows somebody has to fix', () => {
    const ordered = problemsFirst(
      report({
        lines: [
          line({ line: 2, verdict: 'NEW' }),
          line({ line: 3, verdict: 'REJECTED' }),
          line({ line: 4, verdict: 'DUPLICATE' }),
          line({ line: 5, verdict: 'REJECTED' }),
        ],
      }),
    );

    expect(ordered.map((row) => row.line)).toEqual([3, 5, 4, 2]);
  });

  it('says nothing about counts that are zero', () => {
    expect(summaryInWords(report())).toBe('1 would be added');
    expect(
      summaryInWords(
        report({ lines: [line(), line({ line: 3, verdict: 'REJECTED' })] }),
      ),
    ).toBe('1 would be added, 1 could not be read');
  });

  it('reads in the past tense once it has been committed', () => {
    expect(summaryInWords(report({ dryRun: false }))).toBe('1 added');
  });

  it('is only worth committing after a dry run that found something', () => {
    expect(worthCommitting(null)).toBe(false);
    expect(worthCommitting(report({ lines: [line({ verdict: 'REJECTED' })] }))).toBe(false);
    expect(worthCommitting(report({ dryRun: false }))).toBe(false);
    expect(worthCommitting(report())).toBe(true);
  });
});

describe('InstrumentImportComponent', () => {
  let fixture: ComponentFixture<InstrumentImportComponent>;
  let http: HttpTestingController;
  let store: ImportStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InstrumentImportComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InstrumentImportComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    store = fixture.debugElement.injector.get(ImportStore);
  });

  afterEach(() => http.verify());

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.import__do button'));
  }

  it('offers nothing to do until a file is chosen', () => {
    expect(buttons()[0].disabled).toBe(true);
    expect(buttons()[1].disabled).toBe(true);
  });

  it('shows the file and the first few lines once one is taken', () => {
    store.take('bench.csv', FILE);
    fixture.detectChanges();

    expect(text()).toContain('bench.csv, 2 row(s)');
    expect(text()).toContain('MIC-EXT,Mitutoyo');
    expect(buttons()[0].disabled).toBe(false);
  });

  it('checks the file without committing it', () => {
    store.take('bench.csv', FILE);
    fixture.detectChanges();

    buttons()[0].click();

    const request = http.expectOne((call) => call.url.endsWith('/instruments/import'));
    expect(request.request.params.get('commit')).toBe('false');
    expect(request.request.body).toEqual({ file: FILE });
    request.flush(report());
    fixture.detectChanges();

    expect(text()).toContain('What would happen');
    expect(text()).toContain('1 would be added');
  });

  it('only lights the commit button once a dry run found something', () => {
    store.take('bench.csv', FILE);
    fixture.detectChanges();
    buttons()[0].click();

    http
      .expectOne((call) => call.url.endsWith('/instruments/import'))
      .flush(report({ lines: [line({ verdict: 'REJECTED', problems: ['unit is empty'] })] }));
    fixture.detectChanges();

    expect(buttons()[1].disabled).toBe(true);
    expect(text()).toContain('unit is empty');
  });

  it('commits and reads back in the past tense', () => {
    store.take('bench.csv', FILE);
    fixture.detectChanges();
    buttons()[0].click();
    http.expectOne((call) => call.url.endsWith('/instruments/import')).flush(report());
    fixture.detectChanges();

    buttons()[1].click();

    const request = http.expectOne((call) => call.url.endsWith('/instruments/import'));
    expect(request.request.params.get('commit')).toBe('true');
    request.flush(
      report({ dryRun: false, lines: [line({ assetTag: 'SG-0042' })] }),
    );
    fixture.detectChanges();

    expect(text()).toContain('What happened');
    expect(text()).toContain('SG-0042');
  });

  it('throws the last report away when a different file is chosen', () => {
    store.take('bench.csv', FILE);
    fixture.detectChanges();
    buttons()[0].click();
    http.expectOne((call) => call.url.endsWith('/instruments/import')).flush(report());
    fixture.detectChanges();
    expect(text()).toContain('What would happen');

    store.take('other.csv', FILE);
    fixture.detectChanges();

    expect(text()).not.toContain('What would happen');
    expect(buttons()[1].disabled).toBe(true);
  });

  it('shows a refusal where somebody will read it', () => {
    store.take('bench.csv', FILE);
    fixture.detectChanges();
    buttons()[0].click();

    http.expectOne((call) => call.url.endsWith('/instruments/import')).flush(
      {
        type: 'https://errors.slipgauge.internal/registry/validation-failed',
        title: 'VALIDATION_FAILED',
        status: 400,
        detail: 'the file is missing classCode',
        code: 'registry/validation-failed',
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'missing classCode',
    );
  });
});
