export type DdlDialect = 'mysql' | 'postgresql' | 'oracle' | 'sqlserver' | 'sqlite';

export type DbType =
  | 'INT' | 'BIGINT' | 'SMALLINT' | 'TINYINT'
  | 'VARCHAR' | 'CHAR' | 'TEXT' | 'LONGTEXT'
  | 'DATETIME' | 'DATE' | 'TIMESTAMP' | 'TIME'
  | 'DECIMAL' | 'FLOAT' | 'DOUBLE'
  | 'BOOLEAN' | 'JSON' | 'BLOB';

export const DB_TYPES: DbType[] = [
  'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
  'VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT',
  'DATETIME', 'DATE', 'TIMESTAMP', 'TIME',
  'DECIMAL', 'FLOAT', 'DOUBLE',
  'BOOLEAN', 'JSON', 'BLOB',
];

export interface DictionaryEntry {
  id: string;
  name: string;
  dbType: DbType;
  length: number | null;
  /** Digits after the decimal point (DECIMAL only), e.g. DECIMAL(10,2) */
  scale?: number | null;
  notNull: boolean;
  comment: string;
  category?: string;
}

/** "(10,2)", "(255)" or "" */
export function typeSizeSuffix(entry: Pick<DictionaryEntry, 'length' | 'scale'>): string {
  if (entry.length == null) return '';
  return entry.scale != null ? `(${entry.length},${entry.scale})` : `(${entry.length})`;
}

export interface Column {
  id: string;
  logicalName: string;
  physicalName: string;
  dictionaryId: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  defaultValue: string | null;
  comment: string;
  designNote?: string;
}

export interface TableIndex {
  id: string;
  name: string;
  columns: string[];
  unique: boolean;
  comment?: string;
}

export type ConstraintType = 'UNIQUE' | 'CHECK' | 'CUSTOM';

export interface TableConstraint {
  id: string;
  type: ConstraintType;
  name: string;
  expression: string;
  comment?: string;
}

export interface Table {
  id: string;
  logicalName: string;
  physicalName: string;
  comment: string;
  designNote?: string;
  headerColor?: string;
  columns: Column[];
  indexes?: TableIndex[];
  constraints?: TableConstraint[];
  seedData?: Record<string, string>[];
}

export type Cardinality = 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_MANY';

export interface Relation {
  id: string;
  fromTableId: string;
  fromColumnId: string;
  toTableId: string;
  toColumnId: string;
  cardinality: Cardinality;
  hasForeignKey: boolean;
  constraintName: string;
  comment: string;
}

export interface TableLayout {
  tableId: string;
  x: number;
  y: number;
  width: number;
}

export interface RegionLayout {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SchemaVersion {
  id: string;
  name: string;
  date: string;
  tables: Table[];
  relations: Relation[];
  dictionary: DictionaryEntry[];
  layout: {
    nameMode: 'logical' | 'physical';
    tables: TableLayout[];
    regions: RegionLayout[];
    viewport: { x: number; y: number; zoom: number };
  };
}

/** CREATE DATABASE options; each dialect reads the fields it supports (see shared/databaseOptions.ts) */
export interface DatabaseOptions {
  /** MySQL CHARACTER SET / PostgreSQL ENCODING / SQLite PRAGMA encoding */
  charset?: string;
  /** MySQL COLLATE / PostgreSQL LC_COLLATE / SQL Server COLLATE */
  collation?: string;
  /** PostgreSQL LC_CTYPE */
  ctype?: string;
}

export interface DatabaseSettings {
  /** Database name (Oracle: unused, the schema is a user) */
  name: string;
  /** PostgreSQL / SQL Server schema; Oracle schema user. MySQL treats schema = database. */
  schema?: string;
  /** Application user (login role) to create and grant. Passwords are never stored. */
  user?: string;
  /** Kept per dialect, so switching the target DB never yields e.g. utf8mb4 on PostgreSQL */
  options: Partial<Record<DdlDialect, DatabaseOptions>>;
}

export interface DiagramModel {
  version: number;
  database?: DatabaseSettings;
  dictionary: DictionaryEntry[];
  tables: Table[];
  relations: Relation[];
  layout: {
    nameMode: 'logical' | 'physical';
    tables: TableLayout[];
    regions: RegionLayout[];
    viewport: { x: number; y: number; zoom: number };
  };
  schemaVersions?: SchemaVersion[];
}

export function createEmptyModel(): DiagramModel {
  return {
    version: 1,
    dictionary: [],
    tables: [],
    relations: [],
    layout: {
      nameMode: 'logical',
      tables: [],
      regions: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

export function cardinalityLabel(c: Cardinality): { from: string; to: string } {
  switch (c) {
    case 'ONE_TO_ONE':  return { from: '1', to: '1' };
    case 'ONE_TO_MANY': return { from: '1', to: 'N' };
    case 'MANY_TO_MANY': return { from: 'N', to: 'N' };
  }
}
