import { MAX_CORRELATION_LENGTH, sanitise } from '@registry/observability/correlation-id.middleware';
import { LATENCY_BUCKETS, RegistryMetrics } from '@registry/observability/registry-metrics.service';

describe('the correlation id', () => {
  it('keeps a plain identifier as it arrived', () => {
    expect(sanitise('console-4417')).toBe('console-4417');
    expect(sanitise('a_b-C9')).toBe('a_b-C9');
  });

  it('drops anything that is not a plain identifier', () => {
    expect(sanitise('drop table; --')).toBe('droptable--');
    expect(sanitise('a\nb')).toBe('ab');
  });

  it('mints a fresh one when nothing usable arrived', () => {
    expect(sanitise(undefined)).toHaveLength(36);
    expect(sanitise('')).toHaveLength(36);
    expect(sanitise('!!!')).toHaveLength(36);
    expect(sanitise(undefined)).not.toBe(sanitise(undefined));
  });

  it('truncates a long one rather than refusing the request', () => {
    expect(sanitise('x'.repeat(500))).toHaveLength(MAX_CORRELATION_LENGTH);
  });
});

describe('the metrics registry', () => {
  let metrics: RegistryMetrics;

  beforeEach(() => {
    metrics = new RegistryMetrics();
  });

  it('declares every series with its help and its type', () => {
    const rendered = metrics.render();

    expect(rendered).toContain('# TYPE registry_certificates_total counter');
    expect(rendered).toContain('# TYPE registry_overdue_instruments gauge');
    expect(rendered).toContain('# HELP registry_open_assessments Impact assessments not yet closed');
  });

  it('counts a certificate under its verdict and its source', () => {
    metrics.certificateRecorded('PASS', false);
    metrics.certificateRecorded('PASS', false);
    metrics.certificateRecorded('OUT_OF_TOLERANCE', true);

    const rendered = metrics.render();

    expect(rendered).toContain('registry_certificates_total{source="internal",verdict="PASS"} 2');
    expect(rendered).toContain(
      'registry_certificates_total{source="external",verdict="OUT_OF_TOLERANCE"} 1',
    );
  });

  it('keys a series by the label set however the labels were ordered', () => {
    metrics.increment('registry_sign_in_total', { outcome: 'denied' });
    metrics.increment('registry_sign_in_total', { outcome: 'denied' });

    expect(metrics.render()).toContain('registry_sign_in_total{outcome="denied"} 2');
  });

  it('records a gauge as the last value rather than a running total', () => {
    metrics.overdueInstruments(9);
    metrics.overdueInstruments(4);

    expect(metrics.render()).toContain('registry_overdue_instruments 4');
  });

  it('splits an interval move by which way it went', () => {
    metrics.intervalMoved('EXTENDED', 55);
    metrics.intervalMoved('SHORTENED', -182);

    const rendered = metrics.render();

    expect(rendered).toContain('registry_interval_moves_total{basis="EXTENDED",direction="up"} 1');
    expect(rendered).toContain('registry_interval_moves_total{basis="SHORTENED",direction="down"} 1');
  });

  it('drops a request into the first bucket wide enough for it', () => {
    metrics.requestObserved('GET /api/instruments', 0.004);
    metrics.requestObserved('GET /api/instruments', 0.3);
    metrics.requestObserved('GET /api/instruments', 45);

    const rendered = metrics.render();

    expect(rendered).toContain('le="0.005"');
    expect(rendered).toContain('le="0.5"');
    expect(rendered).toContain('le="+Inf"');
    expect(LATENCY_BUCKETS[0]).toBe(0.005);
  });

  it('escapes a label value that would otherwise break the format', () => {
    metrics.increment('registry_traceability_refused_total', { defect: 'a "quoted" \\ thing' });

    expect(metrics.render()).toContain('defect="a \\"quoted\\" \\\\ thing"');
  });

  it('refuses a metric nobody declared', () => {
    expect(() => metrics.increment('registry_made_up_total', {})).toThrow('no metric named');
  });

  it('renders a series with no samples as its header alone', () => {
    const lines = metrics
      .render()
      .split('\n')
      .filter((line) => line.startsWith('registry_'));

    expect(lines).toHaveLength(0);
  });

  it('clears every sample when it is reset', () => {
    metrics.impactRaised('HIGH');
    metrics.reset();

    expect(metrics.render()).not.toContain('registry_impact_raised_total{');
  });
});
