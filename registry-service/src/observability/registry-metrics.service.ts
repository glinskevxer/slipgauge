import { Injectable } from '@nestjs/common';

/** One counter or gauge, with the label set it was recorded under. */
interface Sample {
  readonly labels: Readonly<Record<string, string>>;
  value: number;
}

interface Series {
  readonly help: string;
  readonly type: 'counter' | 'gauge' | 'histogram';
  readonly samples: Map<string, Sample>;
}

/** Bucket edges in seconds. Wide, because these are database bound calls. */
export const LATENCY_BUCKETS = [0.005, 0.025, 0.1, 0.5, 1, 2.5, 10];

/**
 * The metrics the laboratory actually looks at, in Prometheus text format.
 *
 * <p>Hand rolled rather than pulled in. The service exports nine series and a
 * client library would bring a registry, a default collector and a scrape
 * endpoint we would then have to configure out of the way.
 */
@Injectable()
export class RegistryMetrics {
  private readonly series = new Map<string, Series>();

  constructor() {
    this.declare('registry_certificates_total', 'counter', 'Certificates recorded');
    this.declare('registry_traceability_refused_total', 'counter', 'Certificates refused on chain');
    this.declare('registry_interval_moves_total', 'counter', 'Interval decisions that moved');
    this.declare('registry_impact_raised_total', 'counter', 'Impact assessments raised');
    this.declare('registry_sign_in_total', 'counter', 'Sign in attempts by outcome');
    this.declare('registry_overdue_instruments', 'gauge', 'Instruments past their due date');
    this.declare('registry_open_assessments', 'gauge', 'Impact assessments not yet closed');
    this.declare('registry_request_seconds', 'histogram', 'Request latency by route');
  }

  certificateRecorded(verdict: string, external: boolean): void {
    this.increment('registry_certificates_total', {
      verdict,
      source: external ? 'external' : 'internal',
    });
  }

  traceabilityRefused(defect: string): void {
    this.increment('registry_traceability_refused_total', { defect });
  }

  intervalMoved(basis: string, deltaDays: number): void {
    this.increment('registry_interval_moves_total', {
      basis,
      direction: deltaDays >= 0 ? 'up' : 'down',
    });
  }

  impactRaised(severity: string): void {
    this.increment('registry_impact_raised_total', { severity });
  }

  signIn(outcome: 'allowed' | 'denied'): void {
    this.increment('registry_sign_in_total', { outcome });
  }

  overdueInstruments(count: number): void {
    this.set('registry_overdue_instruments', {}, count);
  }

  openAssessments(count: number): void {
    this.set('registry_open_assessments', {}, count);
  }

  /** One request. Recorded as a histogram, so a p95 can be read off it. */
  requestObserved(route: string, seconds: number): void {
    const bucketed = LATENCY_BUCKETS.find((edge) => seconds <= edge);

    this.increment('registry_request_seconds', {
      route,
      le: bucketed === undefined ? '+Inf' : String(bucketed),
    });
  }

  increment(name: string, labels: Record<string, string>, by = 1): void {
    const sample = this.sampleFor(name, labels);

    sample.value += by;
  }

  set(name: string, labels: Record<string, string>, value: number): void {
    this.sampleFor(name, labels).value = value;
  }

  /** Only ever called by a test, and only to make one readable. */
  reset(): void {
    for (const series of this.series.values()) {
      series.samples.clear();
    }
  }

  /** The whole registry in the text exposition format a scraper reads. */
  render(): string {
    const lines: string[] = [];

    for (const [name, series] of this.series) {
      lines.push(`# HELP ${name} ${series.help}`);
      lines.push(`# TYPE ${name} ${series.type}`);

      for (const sample of series.samples.values()) {
        lines.push(`${name}${renderLabels(sample.labels)} ${sample.value}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  private declare(name: string, type: Series['type'], help: string): void {
    this.series.set(name, { help, type, samples: new Map() });
  }

  private sampleFor(name: string, labels: Record<string, string>): Sample {
    const series = this.series.get(name);

    if (!series) {
      throw new Error(`no metric named ${name} was declared`);
    }

    const key = keyOf(labels);
    const existing = series.samples.get(key);

    if (existing) {
      return existing;
    }

    const sample: Sample = { labels: { ...labels }, value: 0 };

    series.samples.set(key, sample);
    return sample;
  }
}

/** Label sets are keyed by their sorted form, so order never splits a series. */
function keyOf(labels: Record<string, string>): string {
  return Object.keys(labels)
    .sort()
    .map((name) => `${name}=${labels[name]}`)
    .join(',');
}

function renderLabels(labels: Readonly<Record<string, string>>): string {
  const names = Object.keys(labels).sort();

  if (names.length === 0) {
    return '';
  }
  const rendered = names.map((name) => `${name}="${escapeLabel(labels[name] ?? '')}"`);

  return `{${rendered.join(',')}}`;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
