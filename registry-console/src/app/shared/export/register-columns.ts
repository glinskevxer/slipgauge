import { InstrumentSummary, statusLabel } from '@core/models/instrument.model';
import { RecallEntry, basisLabel, standingLabel } from '@core/models/recall.model';
import { UsageView } from '@core/models/usage.model';
import { Column } from './csv';

/**
 * The column sets the three export buttons use. They are declared rather than
 * derived from the row type on purpose: an assessor's spreadsheet should not
 * silently gain a column because somebody added a field to an interface.
 */

export const REGISTER_COLUMNS: ReadonlyArray<Column<InstrumentSummary>> = [
  { key: 'assetTag', header: 'Asset tag', value: (row) => row.assetTag },
  { key: 'manufacturer', header: 'Manufacturer', value: (row) => row.manufacturer },
  { key: 'model', header: 'Model', value: (row) => row.model },
  { key: 'serialNumber', header: 'Serial number', value: (row) => row.serialNumber },
  { key: 'classCode', header: 'Class', value: (row) => row.classCode },
  { key: 'discipline', header: 'Discipline', value: (row) => row.discipline },
  { key: 'criticality', header: 'Criticality', value: (row) => row.criticality },
  { key: 'status', header: 'Status', value: (row) => statusLabel(row.status) },
  {
    key: 'referenceStandard',
    header: 'Reference standard',
    value: (row) => (row.referenceStandard ? 'yes' : 'no'),
  },
  { key: 'locationCode', header: 'Location', value: (row) => row.locationCode ?? '' },
  { key: 'custodian', header: 'Custodian', value: (row) => row.custodian ?? '' },
  { key: 'acquiredOn', header: 'Acquired on', value: (row) => row.acquiredOn },
];

export const RECALL_COLUMNS: ReadonlyArray<Column<RecallEntry>> = [
  { key: 'assetTag', header: 'Asset tag', value: (row) => row.assetTag },
  {
    key: 'instrument',
    header: 'Instrument',
    value: (row) => `${row.manufacturer} ${row.model}`,
  },
  { key: 'classCode', header: 'Class', value: (row) => row.classCode },
  { key: 'criticality', header: 'Criticality', value: (row) => row.criticality },
  { key: 'locationCode', header: 'Location', value: (row) => row.locationCode ?? '' },
  { key: 'custodian', header: 'Custodian', value: (row) => row.custodian ?? '' },
  { key: 'lastCalibratedOn', header: 'Last calibrated', value: (row) => row.lastCalibratedOn ?? '' },
  { key: 'intervalDays', header: 'Interval, days', value: (row) => row.intervalDays ?? '' },
  {
    key: 'intervalBasis',
    header: 'Why that interval',
    value: (row) => (row.intervalBasis ? basisLabel(row.intervalBasis) : ''),
  },
  { key: 'nextDueOn', header: 'Next due', value: (row) => row.nextDueOn ?? '' },
  { key: 'standing', header: 'Standing', value: (row) => standingLabel(row.standing) },
];

export const USAGE_COLUMNS: ReadonlyArray<Column<UsageView>> = [
  { key: 'usedOn', header: 'Used on', value: (row) => row.usedOn },
  { key: 'assetTag', header: 'Asset tag', value: (row) => row.assetTag },
  { key: 'usedBy', header: 'Used by', value: (row) => row.usedBy },
  { key: 'workOrder', header: 'Work order', value: (row) => row.workOrder ?? '' },
  { key: 'customer', header: 'Customer', value: (row) => row.customer ?? '' },
  { key: 'purpose', header: 'Purpose', value: (row) => row.purpose ?? '' },
  { key: 'readingCount', header: 'Readings', value: (row) => row.readingCount },
  { key: 'note', header: 'Note', value: (row) => row.note ?? '' },
];
