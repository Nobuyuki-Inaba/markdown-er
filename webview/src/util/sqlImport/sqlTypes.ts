import type { DbType, DdlDialect, TypeSpec } from '@shared/DiagramModel';

export interface ResolvedSqlType {
  spec: TypeSpec;
  /** SERIAL and friends */
  autoIncrement: boolean;
  /** The diagram can't hold this type exactly */
  approximated: boolean;
}

/** Type names with one exact meaning. Sizes come from the type's arguments for the sized types. */
const TYPE_NAMES: Record<string, DbType> = {
  INT: 'INT', INTEGER: 'INT', INT4: 'INT', MEDIUMINT: 'INT',
  BIGINT: 'BIGINT', INT8: 'BIGINT',
  SMALLINT: 'SMALLINT', INT2: 'SMALLINT',
  TINYINT: 'TINYINT',
  VARCHAR: 'VARCHAR', VARCHAR2: 'VARCHAR', NVARCHAR: 'VARCHAR', NVARCHAR2: 'VARCHAR', VARCHARACTER: 'VARCHAR',
  'CHARACTER VARYING': 'VARCHAR', 'CHAR VARYING': 'VARCHAR',
  'NATIONAL CHARACTER VARYING': 'VARCHAR', 'NATIONAL CHAR VARYING': 'VARCHAR',
  CHAR: 'CHAR', CHARACTER: 'CHAR', NCHAR: 'CHAR', BPCHAR: 'CHAR', 'NATIONAL CHARACTER': 'CHAR', 'NATIONAL CHAR': 'CHAR',
  TEXT: 'TEXT', TINYTEXT: 'TEXT', MEDIUMTEXT: 'TEXT', NTEXT: 'TEXT', CITEXT: 'TEXT', CLOB: 'TEXT', NCLOB: 'TEXT',
  LONGTEXT: 'LONGTEXT',
  DATETIME: 'DATETIME', DATETIME2: 'DATETIME', SMALLDATETIME: 'DATETIME',
  DATE: 'DATE',
  TIMESTAMP: 'TIMESTAMP', TIMESTAMPTZ: 'TIMESTAMP', DATETIMEOFFSET: 'TIMESTAMP',
  'TIMESTAMP WITH TIME ZONE': 'TIMESTAMP', 'TIMESTAMP WITHOUT TIME ZONE': 'TIMESTAMP', 'TIMESTAMP WITH LOCAL TIME ZONE': 'TIMESTAMP',
  TIME: 'TIME', TIMETZ: 'TIME', 'TIME WITH TIME ZONE': 'TIME', 'TIME WITHOUT TIME ZONE': 'TIME',
  'INTERVAL DAY TO SECOND': 'TIME',
  DECIMAL: 'DECIMAL', DEC: 'DECIMAL', NUMERIC: 'DECIMAL', FIXED: 'DECIMAL',
  FLOAT: 'FLOAT', FLOAT4: 'FLOAT', REAL: 'FLOAT', BINARY_FLOAT: 'FLOAT',
  DOUBLE: 'DOUBLE', 'DOUBLE PRECISION': 'DOUBLE', FLOAT8: 'DOUBLE', BINARY_DOUBLE: 'DOUBLE',
  BOOLEAN: 'BOOLEAN', BOOL: 'BOOLEAN',
  JSON: 'JSON', JSONB: 'JSON',
  BLOB: 'BLOB', TINYBLOB: 'BLOB', MEDIUMBLOB: 'BLOB', LONGBLOB: 'BLOB', BYTEA: 'BLOB', IMAGE: 'BLOB',
  BINARY: 'BLOB', VARBINARY: 'BLOB', RAW: 'BLOB', 'LONG RAW': 'BLOB',
};

/** Names that mean something else in one database */
const DIALECT_TYPE_NAMES: Partial<Record<DdlDialect, Record<string, DbType>>> = {
  sqlserver: { FLOAT: 'DOUBLE' },
};

const SERIAL_TYPES: Record<string, DbType> = {
  SERIAL: 'INT', SERIAL4: 'INT', BIGSERIAL: 'BIGINT', SERIAL8: 'BIGINT', SMALLSERIAL: 'SMALLINT', SERIAL2: 'SMALLINT',
};

/** Types with no equivalent: the closest type keeps the column usable, and the user is told */
const APPROXIMATE_TYPES: Record<string, TypeSpec> = {
  ENUM: { dbType: 'VARCHAR', length: 255 },
  SET: { dbType: 'VARCHAR', length: 255 },
  UUID: { dbType: 'CHAR', length: 36 },
  UNIQUEIDENTIFIER: { dbType: 'CHAR', length: 36 },
  XML: { dbType: 'TEXT', length: null },
  MONEY: { dbType: 'DECIMAL', length: 19, scale: 4 },
  SMALLMONEY: { dbType: 'DECIMAL', length: 10, scale: 4 },
  YEAR: { dbType: 'SMALLINT', length: null },
  BIT: { dbType: 'BLOB', length: null },
};

const SIZED_TYPES: readonly DbType[] = ['VARCHAR', 'CHAR', 'DECIMAL'];

/** Oracle's NUMBER(p) is how every integer type is written there */
const NUMBER_PRECISIONS: Record<number, DbType> = { 1: 'BOOLEAN', 3: 'TINYINT', 5: 'SMALLINT', 10: 'INT', 19: 'BIGINT' };

function plain(dbType: DbType, length: number | null = null, scale?: number | null): ResolvedSqlType {
  return { spec: scale == null ? { dbType, length } : { dbType, length, scale }, autoIncrement: false, approximated: false };
}

/**
 * The diagram type for a SQL type.
 * `args` are the numeric arguments of `VARCHAR(100)` / `DECIMAL(10,2)`; `max` is `VARCHAR(MAX)`.
 */
export function resolveSqlType(name: string, args: number[], max: boolean, dialect: DdlDialect): ResolvedSqlType {
  const serial = SERIAL_TYPES[name];
  if (serial) { return { ...plain(serial), autoIncrement: true }; }

  if (name === 'NUMBER') {
    const [precision, scale] = args;
    if (precision !== undefined && !scale && NUMBER_PRECISIONS[precision]) { return plain(NUMBER_PRECISIONS[precision]); }
    return plain('DECIMAL', precision ?? null, scale);
  }
  // TINYINT(1) is MySQL's boolean, and integer display widths mean nothing else
  if (name === 'TINYINT' && args[0] === 1) { return plain('BOOLEAN'); }
  if (name === 'BIT' && (args[0] ?? 1) === 1) { return plain('BOOLEAN'); }

  const dbType = DIALECT_TYPE_NAMES[dialect]?.[name] ?? TYPE_NAMES[name];
  if (dbType) {
    if (max && SIZED_TYPES.includes(dbType)) { return plain('TEXT'); }
    return SIZED_TYPES.includes(dbType) ? plain(dbType, args[0] ?? null, args[1]) : plain(dbType);
  }

  return { spec: APPROXIMATE_TYPES[name] ?? { dbType: 'VARCHAR', length: 255 }, autoIncrement: false, approximated: true };
}
