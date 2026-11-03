import type { DatabaseOptions, DdlDialect } from './DiagramModel';

export interface DatabaseOptionField {
  key: keyof DatabaseOptions;
  /** SQL keyword shown as the field label (not translated) */
  label: string;
  /** Used when the field is left empty; undefined = omitted from the DDL */
  defaultValue?: string;
  suggestions: string[];
}

/** Which CREATE DATABASE options each dialect supports. Drives the settings form and the dialect classes. */
export const DATABASE_OPTION_FIELDS: Record<DdlDialect, DatabaseOptionField[]> = {
  mysql: [
    { key: 'charset', label: 'CHARACTER SET', defaultValue: 'utf8mb4',
      suggestions: ['utf8mb4', 'utf8mb3', 'cp932', 'ujis', 'latin1'] },
    { key: 'collation', label: 'COLLATE',
      suggestions: ['utf8mb4_0900_ai_ci', 'utf8mb4_0900_as_cs', 'utf8mb4_ja_0900_as_cs', 'utf8mb4_ja_0900_as_cs_ks',
        'utf8mb4_bin', 'utf8mb4_unicode_ci', 'utf8mb4_general_ci'] },
  ],
  postgresql: [
    { key: 'charset', label: 'ENCODING', defaultValue: 'UTF8', suggestions: ['UTF8', 'EUC_JP', 'SQL_ASCII'] },
    { key: 'collation', label: 'LC_COLLATE', suggestions: ['C', 'C.UTF-8', 'ja_JP.UTF-8', 'en_US.UTF-8'] },
    { key: 'ctype', label: 'LC_CTYPE', suggestions: ['C', 'C.UTF-8', 'ja_JP.UTF-8', 'en_US.UTF-8'] },
  ],
  oracle: [
    { key: 'collation', label: 'DEFAULT COLLATION', suggestions: ['BINARY', 'BINARY_CI', 'BINARY_AI', 'JAPANESE_M_CI'] },
  ],
  sqlserver: [
    { key: 'collation', label: 'COLLATE',
      suggestions: ['Japanese_XJIS_140_CI_AS', 'Japanese_XJIS_140_CI_AS_UTF8', 'Japanese_CI_AS',
        'Latin1_General_100_CI_AS_SC_UTF8', 'SQL_Latin1_General_CP1_CI_AS'] },
  ],
  sqlite: [
    { key: 'charset', label: 'PRAGMA encoding', defaultValue: 'UTF-8', suggestions: ['UTF-8', 'UTF-16le', 'UTF-16be'] },
  ],
};

/** Options for one dialect with defaults applied; fields the dialect doesn't support are dropped */
export function resolveDatabaseOptions(dialect: DdlDialect, options: DatabaseOptions | undefined): DatabaseOptions {
  const resolved: DatabaseOptions = {};
  for (const f of DATABASE_OPTION_FIELDS[dialect]) {
    const value = options?.[f.key]?.trim() || f.defaultValue;
    if (value) { resolved[f.key] = value; }
  }
  return resolved;
}
