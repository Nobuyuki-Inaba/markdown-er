import { DiagramModel } from './DiagramModel';

export type DdlDialect = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver';

export type ExtToWebMsg =
  | { type: 'load'; payload: DiagramModel }
  | { type: 'fileChanged'; payload: DiagramModel }
  | { type: 'ddlResult'; payload: { ddl: string; mode: 'full' | 'diff' | 'version-diff' } }
  | { type: 'dialectChanged'; payload: { dialect: DdlDialect } }
  | { type: 'versionSaved'; payload: DiagramModel }
  | { type: 'undo' }
  | { type: 'redo' };

export type WebToExtMsg =
  | { type: 'ready' }
  | { type: 'save'; payload: DiagramModel; version: number }
  | { type: 'requestDdl'; payload: {
      mode: 'full' | 'diff' | 'version-diff';
      baselineRef?: string;
      fromVersionId?: string;
      toVersionId?: string | null;
      insertSeedData?: boolean;
      skipAutoIncrementPk?: boolean;
    } }
  | { type: 'saveVersion'; payload: { model: DiagramModel } }
  | { type: 'deleteVersion'; payload: { versionId: string } }
  | { type: 'openSettings' };
