import type { DiagramModel, SchemaSnapshot, DictionaryEntry } from '@shared/DiagramModel';
import type { DdlDialect } from '@shared/messages';

function quoteIdentifier(dialect: DdlDialect): (n: string) => string {
  switch (dialect) {
    case 'mysql':     return (n) => `\`${n}\``;
    case 'sqlserver': return (n) => `[${n}]`;
    default:          return (n) => `"${n}"`;
  }
}

function formatColType(dict: Map<string, DictionaryEntry>, dictionaryId: string, dialect: DdlDialect, isPk: boolean): string {
  const entry = dict.get(dictionaryId);
  if (!entry) return dialect === 'sqlserver' ? 'NVARCHAR(255)' : 'VARCHAR(255)';
  const base = entry.dbType;
  switch (dialect) {
    case 'postgresql':
      if (base === 'INT'    && isPk) return 'SERIAL';
      if (base === 'BIGINT' && isPk) return 'BIGSERIAL';
      if (base === 'BOOLEAN')  return 'BOOLEAN';
      if (base === 'DATETIME') return 'TIMESTAMP';
      if (base === 'TINYINT')  return 'SMALLINT';
      break;
    case 'sqlite':
      if (base === 'INT' || base === 'BIGINT' || base === 'TINYINT') return 'INTEGER';
      if (base === 'BOOLEAN')  return 'INTEGER';
      if (base === 'DATETIME') return 'TEXT';
      if (base === 'VARCHAR' || base === 'CHAR' || base === 'TEXT') return 'TEXT';
      if (base === 'DECIMAL' || base === 'FLOAT' || base === 'DOUBLE') return 'REAL';
      return 'TEXT';
    case 'sqlserver':
      if ((base === 'INT' || base === 'BIGINT') && isPk) return `${base} IDENTITY(1,1)`;
      if (base === 'BOOLEAN')  return 'BIT';
      if (base === 'DATETIME') return 'DATETIME2';
      if (base === 'VARCHAR' && entry.length !== null) return `NVARCHAR(${entry.length})`;
      if (base === 'CHAR'    && entry.length !== null) return `NCHAR(${entry.length})`;
      break;
    case 'mysql':
      if ((base === 'INT' || base === 'BIGINT') && isPk) return `${base} AUTO_INCREMENT`;
      if (base === 'BOOLEAN') return 'TINYINT(1)';
      break;
  }
  return entry.length !== null ? `${base}(${entry.length})` : base;
}

export function diffToCurrent(
  snapshot: SchemaSnapshot,
  current: DiagramModel,
  dialect: DdlDialect
): string {
  const q = quoteIdentifier(dialect);
  const newDict = new Map(current.dictionary.map((e) => [e.id, e]));

  const oldTables = new Map(snapshot.tables.map((t) => [t.physicalName, t]));
  const newTables = new Map(current.tables.map((t) => [t.physicalName, t]));

  const stmts: string[] = [];

  // Added tables — emit full CREATE TABLE
  for (const [physName, table] of newTables) {
    if (oldTables.has(physName)) continue;
    const pkCols = table.columns.filter((c) => c.isPrimaryKey).map((c) => c.physicalName);
    const colLines = table.columns.map((col) => {
      const typePart = formatColType(newDict, col.dictionaryId, dialect, col.isPrimaryKey);
      const nullPart = col.isNullable ? 'NULL' : 'NOT NULL';
      const def = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : '';
      return `  ${q(col.physicalName)} ${typePart} ${nullPart}${def}`;
    });
    if (dialect !== 'sqlite' && pkCols.length > 0) {
      colLines.push(`  PRIMARY KEY (${pkCols.map(q).join(', ')})`);
    }
    const trailer = dialect === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    stmts.push(`-- New table\nCREATE TABLE ${q(physName)} (\n${colLines.join(',\n')}\n)${trailer};`);
  }

  // Removed tables — commented out for safety
  for (const physName of oldTables.keys()) {
    if (!newTables.has(physName)) {
      stmts.push(`-- Removed table\n-- DROP TABLE ${q(physName)};`);
    }
  }

  // Modified tables — added / removed columns
  for (const [physName, newTable] of newTables) {
    const oldTable = oldTables.get(physName);
    if (!oldTable) continue;

    const oldCols = new Map(oldTable.columns.map((c) => [c.physicalName, c]));
    const newCols = new Map(newTable.columns.map((c) => [c.physicalName, c]));

    for (const [colName, col] of newCols) {
      if (oldCols.has(colName)) continue;
      const typePart = formatColType(newDict, col.dictionaryId, dialect, col.isPrimaryKey);
      const nullPart = col.isNullable ? 'NULL' : 'NOT NULL';
      const def = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : '';
      const addKw = dialect === 'sqlserver' ? 'ADD' : 'ADD COLUMN';
      stmts.push(`ALTER TABLE ${q(physName)} ${addKw} ${q(colName)} ${typePart} ${nullPart}${def};`);
    }

    for (const colName of oldCols.keys()) {
      if (!newCols.has(colName)) {
        const dropKw = dialect === 'sqlserver' ? 'DROP COLUMN' : 'DROP COLUMN';
        stmts.push(`-- Removed column\n-- ALTER TABLE ${q(physName)} ${dropKw} ${q(colName)};`);
      }
    }
  }

  return stmts.length > 0 ? stmts.join('\n\n') : '-- No schema changes detected since snapshot.';
}
