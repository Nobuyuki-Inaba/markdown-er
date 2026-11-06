import { DiagramModel, DdlDialect } from './DiagramModel';
import type { DdlStyle } from './ddlStyle';
import type { ValidationError } from './validation';

export type { DdlDialect };

/** Resolved UI language */
export type Locale = 'en' | 'ja';
/** Value of the `markdown-er.language` setting; `auto` follows the VSCode display language */
export type LanguageSetting = 'auto' | Locale;

export type ExtToWebMsg =
  | { type: 'load'; payload: DiagramModel; fileUri: string }
  | { type: 'fileChanged'; payload: DiagramModel }
  /** `data`: seed-data INSERTs alone (full mode), for saving to a separate file */
  | { type: 'ddlResult'; payload: { ddl: string; data?: string; mode: 'full' | 'diff' | 'version-diff'; errors?: ValidationError[] } }
  | { type: 'dialectChanged'; payload: { dialect: DdlDialect } }
  | { type: 'localeChanged'; payload: { locale: Locale; setting: LanguageSetting } }
  | { type: 'ddlStyleChanged'; payload: DdlStyle }
  | { type: 'versionSaved'; payload: DiagramModel }
  /** Sent with every load / file change. `readOnly`: the file's format is newer than the extension */
  | { type: 'fileStatus'; payload: { readOnly: boolean; formatVersion: number; supportedVersion: number } }
  | { type: 'undo' }
  | { type: 'redo' };

export type WebToExtMsg =
  | { type: 'ready' }
  | { type: 'save'; payload: DiagramModel; version: number; fileUri: string }
  | { type: 'requestDdl'; payload: {
      mode: 'full' | 'diff' | 'version-diff';
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

export type SqlFileKind = 'ddl' | 'data';
