/**
 * Version of the .ermd file format (front matter `version:`).
 *
 * 1: everything in the .ermd file
 * 2: schema versions in a separate `<file>.ermd.versions.yaml` file
 *
 * Raise it only together with a FormatMigration (src/format/migrations.ts).
 */
export const CURRENT_FORMAT_VERSION = 2;

export type FormatStatus = 'current' | 'old' | 'newer';

export function formatStatus(version: number): FormatStatus {
  if (version > CURRENT_FORMAT_VERSION) { return 'newer'; }
  return version < CURRENT_FORMAT_VERSION ? 'old' : 'current';
}

/** Thrown instead of writing a file whose format is newer than this extension understands */
export class NewerFormatError extends Error {
  constructor(readonly version: number) {
    super(`format version ${version} is newer than the supported version ${CURRENT_FORMAT_VERSION}`);
    this.name = 'NewerFormatError';
  }
}
