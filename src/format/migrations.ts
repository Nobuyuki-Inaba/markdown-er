import { DiagramModel } from '../../shared/DiagramModel';
import type { Locale } from '../../shared/messages';
import { EncodeOptions, EncodedTexts, ErmdTexts, decode, encode } from './ErmdCodec';
import { CURRENT_FORMAT_VERSION, NewerFormatError, formatStatus } from './formatVersion';

/**
 * One step of the .ermd format, from version `from` to `from + 1`.
 * A step changes the model; how the model is laid out in files follows from its version (ErmdCodec).
 */
export abstract class FormatMigration {
  abstract readonly from: number;
  get to(): number { return this.from + 1; }

  /** What the step changes, shown before the user agrees */
  abstract describe(locale: Locale): string;

  apply(model: DiagramModel): DiagramModel {
    return { ...this.transform(model), version: this.to };
  }

  /** Data changes of the step (none when only the file layout changes) */
  protected transform(model: DiagramModel): DiagramModel {
    return model;
  }
}

/** v1 → v2: schema versions move from the .ermd file to `<file>.ermd.versions.yaml` */
export class SeparateVersionsMigration extends FormatMigration {
  readonly from = 1;

  describe(locale: Locale): string {
    return locale === 'ja'
      ? 'スキーマのバージョン（スナップショット）を、.ermd ファイルから別ファイル（<ファイル名>.ermd.versions.yaml）に移します。'
      : 'Moves the schema versions (snapshots) out of the .ermd file into a separate file (<file>.ermd.versions.yaml).';
  }
}

export const MIGRATIONS: readonly FormatMigration[] = [new SeparateVersionsMigration()];

/** The steps from `version` up to `target`, in order */
export function pendingMigrations(
  version: number,
  migrations: readonly FormatMigration[] = MIGRATIONS,
  target = CURRENT_FORMAT_VERSION,
): FormatMigration[] {
  if (version > target) { throw new NewerFormatError(version); }
  const steps: FormatMigration[] = [];
  for (let v = version; v < target; v++) {
    const step = migrations.find((m) => m.from === v);
    if (!step) { throw new Error(`no migration from format version ${v}`); }
    steps.push(step);
  }
  return steps;
}

export function migrateModel(
  model: DiagramModel,
  migrations: readonly FormatMigration[] = MIGRATIONS,
  target = CURRENT_FORMAT_VERSION,
): { model: DiagramModel; applied: FormatMigration[] } {
  const applied = pendingMigrations(model.version, migrations, target);
  return { model: applied.reduce((m, step) => step.apply(m), model), applied };
}

export interface MigrationPlan {
  from: number;
  to: number;
  applied: FormatMigration[];
  /** The files after migration */
  texts: EncodedTexts;
}

/**
 * Migrate a diagram given as file texts. Null when it is already current.
 * Throws NewerFormatError for a file newer than this extension.
 */
export function planMigration(texts: ErmdTexts, options: EncodeOptions): MigrationPlan | null {
  const model = decode(texts);
  if (formatStatus(model.version) === 'newer') { throw new NewerFormatError(model.version); }
  if (formatStatus(model.version) === 'current') { return null; }
  const result = migrateModel(model);
  return {
    from: model.version,
    to: result.model.version,
    applied: result.applied,
    texts: encode(result.model, texts, options),
  };
}
