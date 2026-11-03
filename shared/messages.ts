import { DiagramModel, DdlDialect } from './DiagramModel';

export type { DdlDialect };

/** Resolved UI language */
export type Locale = 'en' | 'ja';
/** Value of the `markdown-er.language` setting; `auto` follows the VSCode display language */
export type LanguageSetting = 'auto' | Locale;

export type ExtToWebMsg =
  | { type: 'load'; payload: DiagramModel; fileUri: string }
  | { type: 'fileChanged'; payload: DiagramModel }
  | { type: 'ddlResult'; payload: { ddl: string; mode: 'full' | 'diff' | 'version-diff' } }
  | { type: 'dialectChanged'; payload: { dialect: DdlDialect } }
  | { type: 'localeChanged'; payload: { locale: Locale; setting: LanguageSetting } }
  | { type: 'versionSaved'; payload: DiagramModel }
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
  | { type: 'openSettings' };
