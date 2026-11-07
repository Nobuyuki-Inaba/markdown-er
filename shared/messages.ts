import { DiagramModel, DdlDialect } from './DiagramModel';
import type { DdlStyle } from './ddlStyle';
import type { ValidationError } from './validation';

export type { DdlDialect };

/** Production DDL, what tests add to it, or an ALTER script from a git ref / saved version */
export type DdlMode = 'full' | 'test' | 'diff' | 'version-diff';

/** Resolved UI language */
export type Locale = 'en' | 'ja';
/** Value of the `markdown-er.language` setting; `auto` follows the VSCode display language */
export type LanguageSetting = 'auto' | Locale;

export type ExtToWebMsg =
  | { type: 'load'; payload: DiagramModel; fileUri: string }
  | { type: 'fileChanged'; payload: DiagramModel }
  /** `data`: seed-data INSERTs alone (full mode), for saving to a separate file */
  | { type: 'ddlResult'; payload: { ddl: string; data?: string; mode: DdlMode; errors?: ValidationError[] } }
  | { type: 'dialectChanged'; payload: { dialect: DdlDialect } }
  | { type: 'localeChanged'; payload: { locale: Locale; setting: LanguageSetting } }
  | { type: 'ddlStyleChanged'; payload: DdlStyle }
  | { type: 'versionSaved'; payload: DiagramModel }
  /** A `save` of this version was written to disk, or failed */
  | { type: 'saveStatus'; payload: { version: number; ok: boolean } }
  /** Sent with every load / file change. `readOnly`: the file's format is newer than the extension */
  | { type: 'fileStatus'; payload: { readOnly: boolean; formatVersion: number; supportedVersion: number } }
  | { type: 'undo' }
  | { type: 'redo' };

export type WebToExtMsg =
  | { type: 'ready' }
  /** `immediate`: Ctrl+S — write now, even a version already tried (retries a failed write) */
  | { type: 'save'; payload: DiagramModel; version: number; fileUri: string; immediate?: boolean }
  | { type: 'requestDdl'; payload: {
      mode: DdlMode;
      baselineRef?: string;
      fromVersionId?: string;
      toVersionId?: string | null;
      insertSeedData?: boolean;
      skipAutoIncrementPk?: boolean;
      includeCreateDatabase?: boolean;
    } }
  | { type: 'saveVersion'; payload: { model: DiagramModel } }
  | { type: 'deleteVersion'; payload: { versionId: string } }
  | { type: 'setLanguage'; payload: { setting: LanguageSetting } }
  | { type: 'setDdlStyle'; payload: Partial<DdlStyle> }
  /** Save DDL or seed data to a file chosen in a save dialog (default name from settings) */
  | { type: 'saveSqlFile'; payload: { kind: SqlFileKind; text: string } }
  | { type: 'openSettings' };

export type SqlFileKind = 'ddl' | 'data' | 'testDdl' | 'testData';
