import { Criticality, Discipline, InstrumentStatus } from './instrument.model';

/** The register filter bar, in the shape the search endpoint binds. */
export interface InstrumentQuery {
  readonly text?: string;
  readonly statuses?: readonly InstrumentStatus[];
  readonly disciplines?: readonly Discipline[];
  readonly criticalities?: readonly Criticality[];
  readonly classCode?: string;
  readonly locationCode?: string;
  readonly referenceOnly?: boolean;
  readonly includeRetired?: boolean;
  readonly acquiredFrom?: string;
  readonly acquiredTo?: string;
}

export const EMPTY_QUERY: InstrumentQuery = {};

/** How many filters are active, which the console shows on the filter button. */
export function activeFilterCount(query: InstrumentQuery): number {
  let count = 0;
  if (query.text?.trim()) {count += 1;}
  if (query.statuses?.length) {count += 1;}
  if (query.disciplines?.length) {count += 1;}
  if (query.criticalities?.length) {count += 1;}
  if (query.classCode) {count += 1;}
  if (query.locationCode) {count += 1;}
  if (query.referenceOnly) {count += 1;}
  if (query.includeRetired) {count += 1;}
  if (query.acquiredFrom || query.acquiredTo) {count += 1;}
  return count;
}

/**
 * Turns a query into the flat parameter map the HTTP layer wants. Empty values
 * are dropped rather than sent blank, because an empty status list and an
 * absent one mean different things to the search endpoint.
 */
export function queryToParams(query: InstrumentQuery): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};
  if (query.text?.trim()) {params['text'] = query.text.trim();}
  if (query.statuses?.length) {params['statuses'] = [...query.statuses];}
  if (query.disciplines?.length) {params['disciplines'] = [...query.disciplines];}
  if (query.criticalities?.length) {params['criticalities'] = [...query.criticalities];}
  if (query.classCode) {params['classCode'] = query.classCode;}
  if (query.locationCode) {params['locationCode'] = query.locationCode;}
  if (query.referenceOnly) {params['referenceOnly'] = 'true';}
  if (query.includeRetired) {params['includeRetired'] = 'true';}
  if (query.acquiredFrom) {params['acquiredFrom'] = query.acquiredFrom;}
  if (query.acquiredTo) {params['acquiredTo'] = query.acquiredTo;}
  return params;
}
