import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BarChartComponent, BarDatum } from '@shared/charts/bar-chart.component';
import { DonutChartComponent, DonutSlice } from '@shared/charts/donut-chart.component';

describe('BarChartComponent', () => {
  let fixture: ComponentFixture<BarChartComponent>;

  interface Bars {
    hasData: () => boolean;
    bars: () => readonly { label: string; x: number; y: number; height: number }[];
    ticks: () => readonly { value: number }[];
    total: () => number;
    labelEvery: () => number;
    showLabel: (index: number) => boolean;
    toneOf: (datum: BarDatum) => string;
  }

  async function render(data: BarDatum[], width = 640): Promise<Bars> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [BarChartComponent] }).compileComponents();
    fixture = TestBed.createComponent(BarChartComponent);
    fixture.componentRef.setInput('data', data);
    fixture.componentRef.setInput('width', width);
    fixture.componentRef.setInput('caption', 'Recall workload');
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Bars;
  }

  it('says so plainly when there is nothing to plot', async () => {
    const chart = await render([]);

    expect(chart.hasData()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Nothing to plot');
  });

  it('draws one bar per datum', async () => {
    const chart = await render([
      { label: 'now', value: 4 },
      { label: '+1w', value: 2 },
    ]);

    expect(chart.bars()).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.bars__bar')).toHaveLength(2);
  });

  it('gives a taller bar to a larger value', async () => {
    const chart = await render([
      { label: 'a', value: 1 },
      { label: 'b', value: 8 },
    ]);

    expect(chart.bars()[1].height).toBeGreaterThan(chart.bars()[0].height);
  });

  it('lays the bars out left to right', async () => {
    const chart = await render([
      { label: 'a', value: 1 },
      { label: 'b', value: 2 },
      { label: 'c', value: 3 },
    ]);

    const xs = chart.bars().map((bar) => bar.x);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  it('draws a flat row of zeros without dividing by nothing', async () => {
    const chart = await render([
      { label: 'a', value: 0 },
      { label: 'b', value: 0 },
    ]);

    expect(chart.bars().every((bar) => bar.height === 0)).toBe(true);
    expect(chart.ticks().length).toBeGreaterThan(0);
  });

  it('adds the values up for the caption', async () => {
    const chart = await render([
      { label: 'a', value: 3 },
      { label: 'b', value: 4 },
    ]);

    expect(chart.total()).toBe(7);
  });

  it('thins the labels rather than rotating them when they will not fit', async () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      label: `+${index}w`,
      value: index,
    }));
    const chart = await render(many, 400);

    expect(chart.labelEvery()).toBeGreaterThan(1);
    expect(chart.showLabel(0)).toBe(true);
    expect(chart.showLabel(1)).toBe(false);
  });

  it('shows every label when there is room', async () => {
    const chart = await render([{ label: 'a', value: 1 }], 640);

    expect(chart.labelEvery()).toBe(1);
    expect(chart.showLabel(0)).toBe(true);
  });

  it('falls back to the neutral tone', async () => {
    const chart = await render([{ label: 'a', value: 1 }]);

    expect(chart.toneOf({ label: 'a', value: 1 })).toBe('neutral');
    expect(chart.toneOf({ label: 'a', value: 1, tone: 'bad' })).toBe('bad');
  });
});

describe('DonutChartComponent', () => {
  let fixture: ComponentFixture<DonutChartComponent>;

  interface Donut {
    total: () => number;
    hasData: () => boolean;
    laidOut: () => readonly { label: string; share: number; path: string }[];
    percent: (share: number) => string;
  }

  async function render(slices: DonutSlice[]): Promise<Donut> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [DonutChartComponent] }).compileComponents();
    fixture = TestBed.createComponent(DonutChartComponent);
    fixture.componentRef.setInput('slices', slices);
    fixture.componentRef.setInput('caption', 'Where the estate stands');
    fixture.componentRef.setInput('centreLabel', 'instruments');
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Donut;
  }

  it('says so when nothing has been recorded', async () => {
    const donut = await render([]);

    expect(donut.hasData()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Nothing recorded yet');
  });

  it('adds the slices up for the middle', async () => {
    const donut = await render([
      { label: 'Overdue', value: 2, tone: 'bad' },
      { label: 'Later', value: 8, tone: 'ok' },
    ]);

    expect(donut.total()).toBe(10);
    expect(fixture.nativeElement.textContent).toContain('instruments');
  });

  it('works out each slice share', async () => {
    const donut = await render([
      { label: 'Overdue', value: 1, tone: 'bad' },
      { label: 'Later', value: 3, tone: 'ok' },
    ]);

    expect(donut.laidOut()[0].share).toBeCloseTo(0.25, 9);
    expect(donut.percent(0.25)).toBe('25%');
  });

  it('leaves an empty slice out of the ring', async () => {
    const donut = await render([
      { label: 'Overdue', value: 0, tone: 'bad' },
      { label: 'Later', value: 4, tone: 'ok' },
    ]);

    expect(donut.laidOut().map((slice) => slice.label)).toEqual(['Later']);
  });

  it('draws an annular path for each slice', async () => {
    const donut = await render([{ label: 'All', value: 5, tone: 'ok' }]);

    expect(donut.laidOut()[0].path).toMatch(/^M[\d.,-]+ A[\d.,\s-]+ L[\d.,-]+ A[\d.,\s-]+ Z$/);
    expect(fixture.nativeElement.querySelectorAll('.donut__slice')).toHaveLength(1);
  });

  it('draws a slice past halfway with the large arc flag', async () => {
    const donut = await render([
      { label: 'Nearly all', value: 9, tone: 'ok' },
      { label: 'A sliver', value: 1, tone: 'bad' },
    ]);

    expect(donut.laidOut()[0].path).toContain(' 1 1 ');
    expect(donut.laidOut()[1].path).toContain(' 0 1 ');
  });

  it('lists every slice in the key with its count', async () => {
    await render([
      { label: 'Overdue', value: 2, tone: 'bad' },
      { label: 'Later', value: 8, tone: 'ok' },
    ]);

    expect(fixture.nativeElement.querySelectorAll('.donut__key li')).toHaveLength(2);
  });
});
