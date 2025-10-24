import type { CsvColumn } from './csv';
import type { InstrumentSummary } from '../instrument/dto/instrument.views';
import type { RecallEntry } from '../recall/recall-standing';

/**
 * What each export actually carries.
 *
 * <p>Kept apart from the controllers because these are a published shape. A
 * quality manager has spreadsheets built on top of them, and a column quietly
 * renamed breaks a formula somewhere nobody can see.
 */
export const REGISTER_EXPORT_COLUMNS: readonly CsvColumn<InstrumentSummary>[] = [
  { header: 'Asset tag', value: (row) => row.assetTag },
  { header: 'Class', value: (row) => row.classCode },
  { header: 'Discipline', value: (row) => row.discipline },
  { header: 'Criticality', value: (row) => row.criticality },
  { header: 'Manufacturer', value: (row) => row.manufacturer },
  { header: 'Model', value: (row) => row.model },
  { header: 'Serial number', value: (row) => row.serialNumber },
  { header: 'Status', value: (row) => row.status },
  { header: 'Reference standard', value: (row) => (row.referenceStandard ? 'yes' : 'no') },
  { header: 'Location', value: (row) => row.locationCode },
  { header: 'Custodian', value: (row) => row.custodian },
  { header: 'Acquired on', value: (row) => row.acquiredOn },
];

export const RECALL_EXPORT_COLUMNS: readonly CsvColumn<RecallEntry>[] = [
  { header: 'Asset tag', value: (row) => row.assetTag },
  { header: 'Class', value: (row) => row.classCode },
  { header: 'Criticality', value: (row) => row.criticality },
  { header: 'Manufacturer', value: (row) => row.manufacturer },
  { header: 'Model', value: (row) => row.model },
  { header: 'Status', value: (row) => row.status },
  { header: 'Location', value: (row) => row.locationCode },
  { header: 'Custodian', value: (row) => row.custodian },
  { header: 'Last calibrated', value: (row) => row.lastCalibratedOn },
  { header: 'Interval days', value: (row) => row.intervalDays },
  { header: 'Next due', value: (row) => row.nextDueOn },
  { header: 'Days until due', value: (row) => row.daysUntilDue },
  { header: 'Standing', value: (row) => row.standing },
  { header: 'Interval basis', value: (row) => row.intervalBasis },
];
