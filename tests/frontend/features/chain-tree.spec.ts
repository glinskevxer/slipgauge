import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import {
  ChainNode,
  chainDepth,
  chainFaults,
  chainSize,
  chainTerminates,
} from '@core/models/calibration.model';
import { ChainTreeComponent } from '@features/traceability/chain-tree.component';

function certificate(label: string, sound: boolean, children: ChainNode[] = []): ChainNode {
  return {
    kind: 'CERTIFICATE',
    certificateId: 1,
    instrumentId: 2,
    assetTag: 'SG-000101',
    label,
    performedOn: '2025-03-04',
    validUntil: '2026-03-04',
    verdict: 'PASS',
    sound,
    note: sound ? null : 'left OUT_OF_TOLERANCE',
    children,
  };
}

function external(label: string, sound: boolean): ChainNode {
  return {
    kind: 'EXTERNAL_STANDARD',
    certificateId: null,
    instrumentId: null,
    assetTag: null,
    label,
    performedOn: '2024-08-01',
    validUntil: '2026-08-01',
    verdict: null,
    sound,
    note: sound ? null : 'its validity did not cover 2025-03-04',
    children: [],
  };
}

describe('chain helpers', () => {
  it('reports depth as the longest branch', () => {
    const tree = certificate('SGM-1', true, [
      external('NPL', true),
      certificate('SGM-2', true, [external('NPL', true)]),
    ]);

    expect(chainDepth(tree)).toBe(2);
    expect(chainSize(tree)).toBe(4);
  });

  it('collects every unsound node in walk order', () => {
    const tree = certificate('SGM-1', true, [
      external('Expired', false),
      certificate('SGM-2', false, [external('NPL', true)]),
    ]);

    expect(chainFaults(tree).map((node) => node.label)).toEqual(['Expired', 'SGM-2']);
  });

  it('terminates when one branch reaches a sound outside standard', () => {
    expect(chainTerminates(certificate('SGM-1', true, [external('NPL', true)]))).toBe(true);
    expect(chainTerminates(certificate('SGM-1', true, [external('Expired', false)]))).toBe(false);
    expect(chainTerminates(certificate('SGM-1', true))).toBe(false);
  });

  it('an unsound certificate breaks its branch whatever is behind it', () => {
    expect(chainTerminates(certificate('SGM-1', false, [external('NPL', true)]))).toBe(false);
  });
});

describe('ChainTreeComponent', () => {
  let fixture: ComponentFixture<ChainTreeComponent>;

  async function render(root: ChainNode): Promise<ChainTreeComponent> {
    // A couple of these render twice to compare two shapes, and TestBed will
    // not accept a second configure without being reset first.
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ChainTreeComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ChainTreeComponent);
    fixture.componentRef.setInput('root', root);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  interface Api {
    laidOut: () => readonly { x: number; y: number; parentX: number | null }[];
    summary: () => string;
    tone: (node: ChainNode) => string;
    width: () => number;
    height: () => number;
    connector: (entry: { x: number; y: number; parentX: number | null; parentY: number | null }) => string;
  }

  it('places one box per node and no two in the same row', async () => {
    const component = (await render(
      certificate('SGM-1', true, [external('NPL', true), external('DKD', true)]),
    )) as unknown as Api;

    const rows = component.laidOut().map((entry) => entry.y);
    expect(rows).toHaveLength(3);
    expect(new Set(rows).size).toBe(3);
    expect(fixture.nativeElement.querySelectorAll('rect')).toHaveLength(3);
  });

  it('puts each hop in its own column', async () => {
    const component = (await render(
      certificate('SGM-1', true, [certificate('SGM-2', true, [external('NPL', true)])]),
    )) as unknown as Api;

    const columns = component.laidOut().map((entry) => entry.x);
    expect(new Set(columns).size).toBe(3);
    expect(columns[0]).toBeLessThan(columns[1]);
    expect(columns[1]).toBeLessThan(columns[2]);
  });

  it('draws no connector from the root', async () => {
    const component = (await render(certificate('SGM-1', true))) as unknown as Api;

    expect(component.laidOut()[0].parentX).toBeNull();
    expect(component.connector({ x: 0, y: 0, parentX: null, parentY: null })).toBe('');
  });

  it('draws an elbow from a parent to each child', async () => {
    const component = (await render(
      certificate('SGM-1', true, [external('NPL', true)]),
    )) as unknown as Api;

    const path = component.connector(
      component.laidOut()[1] as { x: number; y: number; parentX: number | null; parentY: number | null },
    );
    expect(path).toMatch(/^M[\d.]+,[\d.]+ H[\d.]+ V[\d.]+ H[\d.]+$/);
  });

  it('grows the canvas with the depth of the chain', async () => {
    const shallow = (await render(certificate('SGM-1', true))) as unknown as Api;
    const shallowWidth = shallow.width();

    const deep = (await render(
      certificate('SGM-1', true, [certificate('SGM-2', true, [external('NPL', true)])]),
    )) as unknown as Api;

    expect(deep.width()).toBeGreaterThan(shallowWidth);
  });

  it('says how many hops when the chain holds', async () => {
    const component = (await render(
      certificate('SGM-1', true, [external('NPL', true)]),
    )) as unknown as Api;

    expect(component.summary()).toBe('traceable in 1 hop');
  });

  it('counts the problems when it does not', async () => {
    const component = (await render(
      certificate('SGM-1', true, [external('Expired', false)]),
    )) as unknown as Api;

    expect(component.summary()).toBe('1 problem on the chain');
    expect(fixture.nativeElement.textContent).toContain('validity did not cover');
  });

  it('says so when the chain is sound but never reaches an outside laboratory', async () => {
    const component = (await render(
      certificate('SGM-1', true, [certificate('SGM-2', true, [])]),
    )) as unknown as Api;

    expect(component.summary()).toContain('no branch reaches an outside laboratory');
  });

  it('marks an outside standard differently from one of ours', async () => {
    const component = (await render(certificate('SGM-1', true))) as unknown as Api;

    expect(component.tone(external('NPL', true))).toBe('outside');
    expect(component.tone(certificate('SGM-2', true))).toBe('ok');
    expect(component.tone(certificate('SGM-3', false))).toBe('bad');
  });
});
