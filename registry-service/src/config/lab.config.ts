import { registerAs } from '@nestjs/config';

/**
 * Identity of the laboratory this deployment belongs to. Certificate numbers,
 * accreditation references and every recall date are anchored to it, so the
 * values are read once at start up and checked rather than defaulted silently.
 */
export interface LabConfig {
  /** Trading name printed on issued certificates. */
  readonly name: string;
  /** Accreditation body reference, for example a UKAS schedule number. */
  readonly accreditationRef: string;
  /** Time zone every recall date and due date is evaluated in. */
  readonly timeZone: string;
  /** Prefix stamped in front of every generated asset tag. */
  readonly assetTagPrefix: string;
  /** How many digits the numeric part of an asset tag carries. */
  readonly assetTagWidth: number;
  /** Published on the API document rather than in a certificate. */
  readonly version: string;
  readonly website: string;
  readonly contactEmail: string;
}

export const labConfig = registerAs('lab', (): LabConfig => {
  const width = Number(process.env['LAB_ASSET_TAG_WIDTH'] ?? 6);

  if (!Number.isInteger(width) || width < 1) {
    throw new Error('LAB_ASSET_TAG_WIDTH must be a whole number of at least one');
  }

  return {
    name: process.env['LAB_NAME'] ?? 'Slipgauge Metrology',
    accreditationRef: process.env['LAB_ACCREDITATION_REF'] ?? 'UNSET',
    timeZone: process.env['LAB_TIME_ZONE'] ?? 'Europe/London',
    assetTagPrefix: process.env['LAB_ASSET_TAG_PREFIX'] ?? 'SG',
    assetTagWidth: width,
    version: process.env['LAB_API_VERSION'] ?? '1.0.0',
    website: process.env['LAB_WEBSITE'] ?? 'https://slipgauge.internal',
    contactEmail: process.env['LAB_CONTACT_EMAIL'] ?? 'quality@slipgauge.internal',
  };
});
