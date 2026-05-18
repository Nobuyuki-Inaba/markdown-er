import { DiagramModel, DictionaryEntry, Table, Column } from '../shared/DiagramModel';
import { DdlDialect } from '../shared/messages';

export class DdlExporter {
  static export(model: DiagramModel, dialect: DdlDialect = 'mysql'): string {
    const dict = new Map<string, DictionaryEntry>(
      model.dictionary.map((e) => [e.id, e])
    );

    const creates = model.tables.map((t) => tableToCreate(t, dict, dialect)).join('\n\n');

    // SQLite FK constraints are inline only; separate ALTER TABLE not supported
    if (dialect === 'sqlite') {
      return creates;
    }

    const fkStatements = model.relations
      .filter((r) => r.hasForeignKey && r.constraintName)
      .map((r) => {
        const fromTable = model.tables.find((t) => t.id === r.fromTableId);
        const toTable   = model.tables.find((t) => t.id === r.toTableId);
        const fromCol   = fromTable?.columns.find((c) => c.id === r.fromColumnId);
        const toCol     = toTable?.columns.find((c) => c.id === r.toColumnId);
        if (!fromTable || !toTable || !fromCol || !toCol) { return null; }
        const q = quoteIdentifier(dialect);
        return (
          `ALTER TABLE ${q(toTable.physicalName)}\n` +
          `  ADD CONSTRAINT ${q(r.constraintName)}\n` +
          `  FOREIGN KEY (${q(toCol.physicalName)})\n` +
          `  REFERENCES ${q(fromTable.physicalName)} (${q(fromCol.physicalName)});`
        );
      })
      .filter(Boolean)
      .join('\n\n');

    return [creates, fkStatements].filter(Boolean).join('\n\n');
  }
}

// Returns a quoting function for identifier names
function quoteIdentifier(dialect: DdlDialect): (name: string) => string {
  switch (dialect) {
    case 'mysql':      return (n) => `\`${n}\``;
    case 'sqlserver':  return (n) => `[${n}]`;
    default:           return (n) => `"${n}"`;  // postgresql, sqlite
  }
}

function tableToCreate(table: Table, dict: Map<string, DictionaryEntry>, dialect: DdlDialect): string {
  const q = quoteIdentifier(dialect);
  const pkCols = table.columns.filter((c) => c.isPrimaryKey).map((c) => c.physicalName);

  const colLines = table.columns.map((col) => {
    const entry = dict.get(col.dictionaryId);
    const typePart = entry ? formatType(entry, dialect, col.isPrimaryKey) : defaultStringType(dialect);
    const nullPart = col.isNullable ? 'NULL' : 'NOT NULL';
    const defaultPart = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : '';
    return `  ${q(col.physicalName)} ${typePart} ${nullPart}${defaultPart}`;
  });

  // SQLite: PRIMARY KEY is declared on the column itself (INTEGER PRIMARY KEY = rowid alias)
  // Other dialects: use a table-level PRIMARY KEY constraint
  if (dialect !== 'sqlite' && pkCols.length > 0) {
    colLines.push(`  PRIMARY KEY (${pkCols.map(q).join(', ')})`);
  }

  const trailer = tableTrailer(table, dialect);
  return (
    `CREATE TABLE ${q(table.physicalName)} (\n` +
    colLines.join(',\n') +
    `\n)${trailer};`
  );
}

function tableTrailer(table: Table, dialect: DdlDialect): string {
  switch (dialect) {
    case 'mysql': {
      const comment = table.comment ? ` COMMENT='${table.comment.replace(/'/g, "\\'")}'` : '';
      return ` ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${comment}`;
    }
    default:
      return '';
  }
}

function defaultStringType(dialect: DdlDialect): string {
  return dialect === 'sqlserver' ? 'NVARCHAR(255)' : 'VARCHAR(255)';
}

function formatType(entry: DictionaryEntry, dialect: DdlDialect, isPk: boolean): string {
  const base = entry.dbType;

  // Dialect-specific type mappings
  switch (dialect) {
    case 'postgresql':
      if (base === 'INT'    && isPk) { return 'SERIAL'; }
      if (base === 'BIGINT' && isPk) { return 'BIGSERIAL'; }
      if (base === 'BOOLEAN')        { return 'BOOLEAN'; }
      if (base === 'DATETIME')       { return 'TIMESTAMP'; }
      if (base === 'TINYINT')        { return 'SMALLINT'; }
      break;

    case 'sqlite':
      if (base === 'INT' || base === 'BIGINT' || base === 'TINYINT') { return 'INTEGER'; }
      if (base === 'BOOLEAN')  { return 'INTEGER'; }
      if (base === 'DATETIME') { return 'TEXT'; }
      if (base === 'VARCHAR' || base === 'CHAR' || base === 'TEXT') { return 'TEXT'; }
      if (base === 'DECIMAL' || base === 'FLOAT' || base === 'DOUBLE') { return 'REAL'; }
      return 'TEXT';

    case 'sqlserver':
      if (base === 'INT'    && isPk) { return 'INT IDENTITY(1,1)'; }
      if (base === 'BIGINT' && isPk) { return 'BIGINT IDENTITY(1,1)'; }
      if (base === 'BOOLEAN')        { return 'BIT'; }
      if (base === 'DATETIME')       { return 'DATETIME2'; }
      if (base === 'TINYINT')        { return 'TINYINT'; }
      if (base === 'VARCHAR' && entry.length !== null) { return `NVARCHAR(${entry.length})`; }
      if (base === 'CHAR'    && entry.length !== null) { return `NCHAR(${entry.length})`; }
      break;

    case 'mysql':
      if (base === 'INT'    && isPk) { return 'INT AUTO_INCREMENT'; }
      if (base === 'BIGINT' && isPk) { return 'BIGINT AUTO_INCREMENT'; }
      if (base === 'BOOLEAN')        { return 'TINYINT(1)'; }
      break;
  }

  // Default: append length if present
  return entry.length !== null ? `${base}(${entry.length})` : base;
}
