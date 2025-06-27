import {
  CertificateView,
  MeasurementPointView,
  Verdict,
} from '@core/models/calibration.model';
import {
  Criticality,
  InstrumentDetail,
  InstrumentStatus,
  InstrumentSummary,
} from '@core/models/instrument.model';
import { Page } from '@core/models/page.model';
import { RecallEntry, RecallStanding } from '@core/models/recall.model';
import { UsageView } from '@core/models/usage.model';

/**
 * The shapes the specs build.
 *
 * <p>Six spec files had grown their own copy of these, and they had drifted far
 * enough that two of them were still setting a field the interface had dropped.
 * A change to a payload should break the factory once, not six files that each
 * describe the same instrument slightly differently.
 */

export function summary(
  assetTag: string,
  overrides: Partial<InstrumentSummary> = {},
): InstrumentSummary {
  return {
    id: Number(assetTag.replace(/\D/g, '')) || 1,
    assetTag,
    manufacturer: 'Mitutoyo',
    model: '103-137',
    serialNumber: assetTag.replace('SG-', 'SN-'),
    classCode: 'MIC-EXT',
    discipline: 'DIMENSIONAL',
    criticality: 'IMPORTANT',
    status: 'IN_SERVICE',
    referenceStandard: false,
    locationCode: 'HARLOW-DIM',
    custodian: 'R Okonjo',
    acquiredOn: '2021-03-01',
    ...overrides,
  };
}

export function detail(
  assetTag: string,
  overrides: Partial<InstrumentDetail> = {},
): InstrumentDetail {
  return {
    ...summary(assetTag),
    description: null,
    className: 'External micrometer',
    baseIntervalDays: 365,
    minIntervalDays: 180,
    maxIntervalDays: 730,
    unit: 'mm',
    rangeLow: 0,
    rangeHigh: 25,
    resolution: 0.001,
    locationPath: ['HARLOW', 'HARLOW-LAB', 'HARLOW-DIM'],
    retiredOn: null,
    createdAt: '2021-03-01T09:00:00Z',
    updatedAt: '2025-04-14T09:00:00Z',
    version: 3,
    ...overrides,
  };
}

export function pageOf<T>(items: T[], overrides: Partial<Page<T>> = {}): Page<T> {
  return {
    items,
    page: 0,
    size: 50,
    totalItems: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / 50)),
    first: true,
    last: true,
    ...overrides,
  };
}

export function point(overrides: Partial<MeasurementPointView> = {}): MeasurementPointView {
  return {
    id: 1,
    sequenceNo: 1,
    label: '5 mm',
    nominal: 5,
    unit: 'mm',
    asFound: 5.0012,
    asLeft: 5.0001,
    asFoundError: 0.0012,
    asLeftError: 0.0001,
    normalisedAsFoundError: 0.3,
    toleranceLow: 4.996,
    toleranceHigh: 5.004,
    expandedUncertainty: 0.0005,
    coverageFactor: 2,
    asFoundVerdict: 'PASS',
    asLeftVerdict: 'PASS',
    ...overrides,
  };
}

/** A point sitting at a given fraction of its permitted band. */
export function pointAt(
  normalised: number | null,
  sequenceNo = 1,
  verdict: Verdict = 'PASS',
): MeasurementPointView {
  return point({
    id: sequenceNo,
    sequenceNo,
    asFound: normalised === null ? null : 5 + normalised * 0.004,
    asFoundError: normalised === null ? null : normalised * 0.004,
    normalisedAsFoundError: normalised,
    asFoundVerdict: verdict,
  });
}

export function certificate(
  certificateNumber: string,
  overrides: Partial<CertificateView> = {},
): CertificateView {
  return {
    id: Number(certificateNumber.replace(/\D/g, '')) || 1,
    certificateNumber,
    instrumentId: 12,
    assetTag: 'SG-000101',
    performedOn: '2025-04-14',
    issuedOn: '2025-04-15',
    performedBy: 'R Okonjo',
    approvedBy: null,
    issuingLab: 'Slipgauge Metrology',
    externalLab: false,
    ambientTemperature: null,
    ambientHumidity: null,
    asFoundVerdict: 'PASS',
    asLeftVerdict: 'PASS',
    adjusted: false,
    remarks: null,
    live: true,
    withdrawnAt: null,
    withdrawnReason: null,
    supersededById: null,
    points: [],
    ...overrides,
  };
}

export function recallEntry(
  assetTag: string,
  daysUntilDue: number,
  standing: RecallStanding,
  overrides: Partial<RecallEntry> = {},
): RecallEntry {
  return {
    instrumentId: Number(assetTag.replace(/\D/g, '')) || 1,
    assetTag,
    manufacturer: 'Mitutoyo',
    model: '103-137',
    classCode: 'MIC-EXT',
    criticality: 'ROUTINE' as Criticality,
    status: 'IN_SERVICE' as InstrumentStatus,
    referenceStandard: false,
    locationCode: 'HARLOW-DIM',
    custodian: 'R Okonjo',
    lastCalibratedOn: '2025-04-01',
    intervalDays: 365,
    nextDueOn: '2026-04-01',
    daysUntilDue,
    standing,
    intervalBasis: 'BASE',
    ...overrides,
  };
}

export function usage(
  id: number,
  usedOn: string,
  workOrder: string | null,
  overrides: Partial<UsageView> = {},
): UsageView {
  return {
    id,
    instrumentId: 12,
    assetTag: 'SG-000101',
    usedOn,
    usedBy: 'D Ferreira',
    workOrder,
    customer: workOrder ? 'Fenland Turbines' : null,
    purpose: 'in process check',
    readingCount: 1,
    note: null,
    createdAt: '2026-03-01T09:00:00Z',
    ...overrides,
  };
}

/** A problem document, for the paths a spec wants the service to refuse. */
export function problem(code: string, status: number, detail: string): Record<string, unknown> {
  return {
    type: `https://errors.slipgauge.internal/${code}`,
    title: code.toUpperCase(),
    status,
    detail,
    code,
    timestamp: '2026-04-07T09:00:00Z',
  };
}

/**
 * Puts a session into the tab before the session service reads it, so a spec
 * about a component behind a role guard does not have to sign in over HTTP.
 */
export function signedInAs(...roles: string[]): void {
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const payload = btoa(JSON.stringify({ sub: 'h.whitcombe', exp: expiry }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  sessionStorage.setItem(
    'slipgauge.session',
    JSON.stringify({
      accessToken: `header.${payload}.signature`,
      refreshToken: 'refresh',
      username: 'h.whitcombe',
      displayName: 'Helen Whitcombe',
      roles: roles.length > 0 ? roles : ['METROLOGIST', 'QUALITY_MANAGER'],
      expiresAt: expiry * 1000,
    }),
  );
}

export function signedOut(): void {
  sessionStorage.clear();
}
