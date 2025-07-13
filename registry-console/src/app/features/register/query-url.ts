import { Params } from '@angular/router';

import { InstrumentQuery } from '@core/models/instrument-query.model';
import { Criticality, Discipline, InstrumentStatus } from '@core/models/instrument.model';

/**
 * The register query, carried in the address bar.
 *
 * <p>This exists because of one complaint, repeated: a technician finds a set
 * of instruments, sends the link to a colleague, and the colleague opens an
 * unfiltered register. Anything the filter bar can express has to survive being
 * pasted into a message.
 */

const STATUSES: readonly InstrumentStatus[] = [
  'IN_SERVICE',
  'IN_CALIBRATION',
  'QUARANTINED',
  'UNDER_REPAIR',
  'ON_LOAN',
  'RETIRED',
];

const DISCIPLINES: readonly Discipline[] = [
  'DIMENSIONAL',
  'ELECTRICAL',
  'MASS',
  'PRESSURE',
  'TEMPERATURE',
  'FLOW',
  'TORQUE',
  'TIME',
];

const CRITICALITIES: readonly Criticality[] = ['ROUTINE', 'IMPORTANT', 'CRITICAL'];

export interface RegisterView {
  readonly query: InstrumentQuery;
  readonly page: number;
  readonly sort: string;
}

export function viewToParams(view: RegisterView): Params {
  const params: Params = {};
  const { query } = view;

  if (query.text?.trim()) {params['q'] = query.text.trim();}
  if (query.statuses?.length) {params['status'] = query.statuses.join(',');}
  if (query.disciplines?.length) {params['discipline'] = query.disciplines.join(',');}
  if (query.criticalities?.length) {params['criticality'] = query.criticalities.join(',');}
  if (query.classCode) {params['class'] = query.classCode;}
  if (query.locationCode) {params['location'] = query.locationCode;}
  if (query.referenceOnly) {params['standards'] = '1';}
  if (query.includeRetired) {params['retired'] = '1';}
  if (query.acquiredFrom) {params['from'] = query.acquiredFrom;}
  if (query.acquiredTo) {params['to'] = query.acquiredTo;}
  if (view.page > 0) {params['page'] = String(view.page + 1);}
  if (view.sort && view.sort !== 'assetTag') {params['sort'] = view.sort;}

  return params;
}

/**
 * Reads a view back out of the address bar. Anything unrecognised is dropped
 * rather than passed through, because a hand edited or truncated link must not
 * be able to send an unknown enum value to the search endpoint.
 */
export function paramsToView(params: Params): RegisterView {
  const query: Record<string, unknown> = {};

  const text = stringOf(params['q']);
  if (text) {query['text'] = text;}

  const statuses = listOf(params['status'], STATUSES);
  if (statuses.length) {query['statuses'] = statuses;}

  const disciplines = listOf(params['discipline'], DISCIPLINES);
  if (disciplines.length) {query['disciplines'] = disciplines;}

  const criticalities = listOf(params['criticality'], CRITICALITIES);
  if (criticalities.length) {query['criticalities'] = criticalities;}

  const classCode = stringOf(params['class']);
  if (classCode) {query['classCode'] = classCode;}

  const locationCode = stringOf(params['location']);
  if (locationCode) {query['locationCode'] = locationCode;}

  if (stringOf(params['standards']) === '1') {query['referenceOnly'] = true;}
  if (stringOf(params['retired']) === '1') {query['includeRetired'] = true;}

  const from = dateOf(params['from']);
  if (from) {query['acquiredFrom'] = from;}

  const to = dateOf(params['to']);
  if (to) {query['acquiredTo'] = to;}

  return {
    query: query as InstrumentQuery,
    page: pageOf(params['page']),
    sort: sortOf(params['sort']),
  };
}

/** True when two views would produce the same request, so no navigation is needed. */
export function sameView(left: RegisterView, right: RegisterView): boolean {
  return (
    JSON.stringify(viewToParams(left)) === JSON.stringify(viewToParams(right))
  );
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function listOf<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  const raw = stringOf(value);
  if (!raw) {
    return [];
  }
  const permitted = new Set<string>(allowed);
  const seen = new Set<string>();
  return raw
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => permitted.has(entry) && !seen.has(entry) && seen.add(entry))
    .map((entry) => entry as T);
}

function dateOf(value: unknown): string {
  const raw = stringOf(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function pageOf(value: unknown): number {
  const raw = Number(stringOf(value));
  if (!Number.isInteger(raw) || raw < 1) {
    return 0;
  }
  return raw - 1;
}

function sortOf(value: unknown): string {
  const raw = stringOf(value);
  const allowed = new Set([
    'assetTag',
    'manufacturer',
    'model',
    'serialNumber',
    'status',
    'acquiredOn',
    'classCode',
    'discipline',
    'criticality',
  ]);
  const column = raw.startsWith('-') ? raw.slice(1) : raw;
  return allowed.has(column) ? raw : 'assetTag';
}
