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

export type DbTypeKind = 'string' | 'number' | 'datetime' | 'other';

/** Basic types by kind, in display order */
export const DB_TYPE_KINDS: { kind: DbTypeKind; types: DbType[] }[] = [
  { kind: 'string',   types: ['VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT'] },
  { kind: 'number',   types: ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'FLOAT', 'DOUBLE'] },
  { kind: 'datetime', types: ['DATETIME', 'DATE', 'TIMESTAMP', 'TIME'] },
  { kind: 'other',    types: ['BOOLEAN', 'JSON', 'BLOB'] },
];

export function dbTypeKind(dbType: DbType): DbTypeKind {
  return DB_TYPE_KINDS.find((k) => k.types.includes(dbType))?.kind ?? 'other';
}

/** A concrete column type, e.g. VARCHAR(100) or DECIMAL(10,2) */
export interface TypeSpec {
  dbType: DbType;
  length: number | null;
  /** Digits after the decimal point (DECIMAL only), e.g. DECIMAL(10,2) */
  scale?: number | null;
}

/** A named, reusable type */
export interface DictionaryEntry extends TypeSpec {
  id: string;
  name: string;
  /** Default NOT NULL applied to a column when the type is chosen */
  notNull: boolean;
  comment: string;
  category?: string;
}

/** The column's type: its dictionary entry if it resolves, else its direct type */
export function columnTypeSpec(col: Column, dictionary: ReadonlyMap<string, DictionaryEntry> | DictionaryEntry[]): TypeSpec | undefined {
  const entry = Array.isArray(dictionary)
    ? dictionary.find((e) => e.id === col.dictionaryId)
    : dictionary.get(col.dictionaryId);
  return entry ?? col.type;
}

/**
 * Types that take a size: length or precision (DECIMAL). Integers have none — MySQL's display width
 * (INT(11)) is deprecated and doesn't change the range; an existing one stays editable so it can be cleared.
 */
const SIZED_DB_TYPES: DbType[] = ['VARCHAR', 'CHAR', 'DECIMAL'];

export function typeTakesSize(dbType: DbType): boolean {
  return SIZED_DB_TYPES.includes(dbType);
}

/** "VARCHAR(100)" */
export function formatTypeSpec(spec: TypeSpec): string {
  return `${spec.dbType}${typeSizeSuffix(spec)}`;
}

/** "10,2", "255" or "" */
export function formatTypeSize(entry: Pick<TypeSpec, 'length' | 'scale'>): string {
  if (entry.length == null) return '';
  return entry.scale != null ? `${entry.length},${entry.scale}` : `${entry.length}`;
}

/** "10,2" → { length: 10, scale: 2 }, "" → no size, null when not a size */
export function parseTypeSize(text: string): Pick<TypeSpec, 'length' | 'scale'> | null {
  const m = text.trim().match(/^(?:(\d+)\s*(?:,\s*(\d+))?)?$/);
  if (!m) return null;
  return { length: m[1] ? parseInt(m[1], 10) : null, scale: m[2] ? parseInt(m[2], 10) : null };
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
  /** Dictionary type; takes precedence over `type` when it resolves */
  dictionaryId: string;
  /** Type given directly, without the dictionary */
  type?: TypeSpec;
  isPrimaryKey: boolean;
  isNullable: boolean;
  defaultValue: string | null;
  comment: string;
  designNote?: string;
  /** Set when the column comes from a column set; kept in sync with that set's column */
  columnSet?: { setId: string; columnId: string };
}

/** Reusable group of columns (e.g. audit columns), applied to tables by reference */
export interface ColumnSet {
  id: string;
  name: string;
  /** Where the set's columns go in a table */
  position: 'start' | 'end';
  /** Applied automatically to tables added afterwards */
  applyToNewTables?: boolean;
  columns: Column[];
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
  /** Column sets applied to this table, in order */
  columnSetIds?: string[];
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
  columnSets?: ColumnSet[];
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
