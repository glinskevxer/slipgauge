/**
 * The measurement discipline a class of instrument belongs to. Accreditation
 * scope is granted per discipline, so it decides which technicians may sign a
 * certificate as well as how the register is grouped.
 */
export enum Discipline {
  DIMENSIONAL = 'DIMENSIONAL',
  ELECTRICAL = 'ELECTRICAL',
  MASS = 'MASS',
  PRESSURE = 'PRESSURE',
  TEMPERATURE = 'TEMPERATURE',
  FLOW = 'FLOW',
  TORQUE = 'TORQUE',
  TIME = 'TIME',
}

/** Every discipline, in the order the schedule of accreditation lists them. */
export const ALL_DISCIPLINES: readonly Discipline[] = Object.values(Discipline);

/**
 * How much of the laboratory's output depends on the instrument being right.
 * Criticality caps how far the interval engine may stretch a class, and it
 * orders the recall queue when capacity runs short.
 */
export enum Criticality {
  ROUTINE = 'ROUTINE',
  IMPORTANT = 'IMPORTANT',
  CRITICAL = 'CRITICAL',
}

/**
 * Fraction of a nominal interval extension this criticality allows. A critical
 * instrument earns half the step a routine one would.
 */
const EXTENSION_FACTORS: Readonly<Record<Criticality, number>> = {
  [Criticality.ROUTINE]: 1,
  [Criticality.IMPORTANT]: 0.75,
  [Criticality.CRITICAL]: 0.5,
};

export function extensionFactor(criticality: Criticality): number {
  return EXTENSION_FACTORS[criticality];
}

/**
 * Where an instrument sits in its service life. The transitions are narrow on
 * purpose. An instrument may only become usable again through a route that
 * leaves a record behind, which is why RETIRED has no outgoing edges.
 */
export enum InstrumentStatus {
  IN_SERVICE = 'IN_SERVICE',
  IN_CALIBRATION = 'IN_CALIBRATION',
  QUARANTINED = 'QUARANTINED',
  UNDER_REPAIR = 'UNDER_REPAIR',
  ON_LOAN = 'ON_LOAN',
  RETIRED = 'RETIRED',
}

const TRANSITIONS: Readonly<Record<InstrumentStatus, readonly InstrumentStatus[]>> = {
  [InstrumentStatus.IN_SERVICE]: [
    InstrumentStatus.IN_CALIBRATION,
    InstrumentStatus.QUARANTINED,
    InstrumentStatus.UNDER_REPAIR,
    InstrumentStatus.ON_LOAN,
    InstrumentStatus.RETIRED,
  ],
  [InstrumentStatus.IN_CALIBRATION]: [
    InstrumentStatus.IN_SERVICE,
    InstrumentStatus.QUARANTINED,
    InstrumentStatus.UNDER_REPAIR,
    InstrumentStatus.RETIRED,
  ],
  [InstrumentStatus.QUARANTINED]: [
    InstrumentStatus.UNDER_REPAIR,
    InstrumentStatus.IN_CALIBRATION,
    InstrumentStatus.RETIRED,
  ],
  [InstrumentStatus.UNDER_REPAIR]: [InstrumentStatus.IN_CALIBRATION, InstrumentStatus.RETIRED],
  [InstrumentStatus.ON_LOAN]: [InstrumentStatus.IN_SERVICE, InstrumentStatus.QUARANTINED],
  [InstrumentStatus.RETIRED]: [],
};

const USABLE: readonly InstrumentStatus[] = [InstrumentStatus.IN_SERVICE, InstrumentStatus.ON_LOAN];

/** True when the instrument may legitimately be used to take a reading. */
export function statusIsUsable(status: InstrumentStatus): boolean {
  return USABLE.includes(status);
}

export function canTransition(from: InstrumentStatus, to: InstrumentStatus): boolean {
  return from !== to && TRANSITIONS[from].includes(to);
}

export function transitionsFrom(status: InstrumentStatus): readonly InstrumentStatus[] {
  return TRANSITIONS[status];
}
