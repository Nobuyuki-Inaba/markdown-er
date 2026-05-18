import { DiagramModel } from './DiagramModel';

export type ExtToWebMsg =
  | { type: 'load'; payload: DiagramModel }
  | { type: 'fileChanged'; payload: DiagramModel }
  | { type: 'ddlResult'; payload: { ddl: string; mode: 'full' | 'diff' } }
  | { type: 'undo' }
  | { type: 'redo' };

export type WebToExtMsg =
  | { type: 'ready' }
  | { type: 'save'; payload: DiagramModel; version: number }
  | { type: 'requestDdl'; payload: { mode: 'full' | 'diff'; baselineRef?: string } };
