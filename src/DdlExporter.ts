import { DiagramModel, DictionaryEntry, Table, Column, TableIndex, TableConstraint } from '../shared/DiagramModel';
import { DdlDialect } from '../shared/messages';

export interface DdlOptions {
  insertSeedData?: boolean;
  skipAutoIncrementPk?: boolean;
}

export class DdlExporter {
  static export(model: DiagramModel, dialect: DdlDialect = 'mysql', options: DdlOptions = {}): string {
    const dict = new Map<string, DictionaryEntry>(
      model.dictionary.map((e) => [e.id, e])
    );

    const creates = model.tables.map((t) => tableToCreate(t, dict, dialect)).join('\n\n');

    // SQLite FK constraints are inline only; separate ALTER TABLE not supported
    const fkStatements = dialect === 'sqlite' ? '' : model.relations
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

    const indexStatements = model.tables.flatMap((t) =>
      (t.indexes ?? []).map((idx) => indexToSql(t, idx, dialect))
    ).join('\n\n');

    const schemaPart = [creates, fkStatements, indexStatements].filter(Boolean).join('\n\n');

    if (!options.insertSeedData) {
      return schemaPart;
    }

    const insertsPart = generateInserts(model, dict, dialect, options.skipAutoIncrementPk ?? false);
    return [schemaPart, insertsPart ? `-- Seed Data\n${insertsPart}` : ''].filter(Boolean).join('\n\n');
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

  for (const c of (table.constraints ?? [])) {
    if (c.type === 'UNIQUE' && c.name && c.expression) {
      const cols = c.expression.split(',').map((s) => q(s.trim())).join(', ');
      colLines.push(`  CONSTRAINT ${q(c.name)} UNIQUE (${cols})`);
    } else if (c.type === 'CHECK' && c.name && c.expression) {
      colLines.push(`  CONSTRAINT ${q(c.name)} CHECK (${c.expression})`);
    }
  }

  const trailer = tableTrailer(table, dialect);
  return (
    `CREATE TABLE ${q(table.physicalName)} (\n` +
    colLines.join(',\n') +
    `\n)${trailer};`
  );
}

function tableTrailer(table: Table, dialect: DdlDialect): string {
  const customDdl = (table.constraints ?? [])
    .filter((c) => c.type === 'CUSTOM' && c.expression.trim())
    .map((c) => c.expression.trimEnd() + (c.expression.trimEnd().endsWith(';') ? '' : ';'))
    .join('\n');

  switch (dialect) {
    case 'mysql': {
      const comment = table.comment ? ` COMMENT='${table.comment.replace(/'/g, "\\'")}'` : '';
      return ` ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${comment}${customDdl ? '\n' + customDdl : ''}`;
    }
    default:
      return customDdl ? '\n' + customDdl : '';
  }
}

function indexToSql(table: Table, idx: TableIndex, dialect: DdlDialect): string {
  const q = quoteIdentifier(dialect);
  const unique = idx.unique ? 'UNIQUE ' : '';
  const cols = idx.columns.map(q).join(', ');
  return `CREATE ${unique}INDEX ${q(idx.name)} ON ${q(table.physicalName)} (${cols});`;
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

function isAutoIncrementCol(col: Column, dict: Map<string, DictionaryEntry>, dialect: DdlDialect): boolean {
  if (!col.isPrimaryKey) return false;
  const entry = dict.get(col.dictionaryId);
  if (!entry) return false;
  if (dialect === 'sqlite') {
    return entry.dbType === 'INT' || entry.dbType === 'BIGINT' || entry.dbType === 'TINYINT';
  }
  return entry.dbType === 'INT' || entry.dbType === 'BIGINT';
}

function isNumericDbType(dbType: string): boolean {
  return ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'FLOAT', 'DOUBLE'].includes(dbType);
}

function generateInserts(
  model: DiagramModel,
  dict: Map<string, DictionaryEntry>,
  dialect: DdlDialect,
  skipAutoIncrementPk: boolean
): string {
  const q = quoteIdentifier(dialect);
  const stmts: string[] = [];

  for (const table of model.tables) {
    if (!table.seedData?.length) continue;

    const insertCols = skipAutoIncrementPk
      ? table.columns.filter((c) => !isAutoIncrementCol(c, dict, dialect))
      : table.columns;

    if (insertCols.length === 0) continue;

    const colList = insertCols.map((c) => q(c.physicalName)).join(', ');

    const rows = table.seedData.map((row) => {
      const vals = insertCols.map((c) => {
        const raw = row[c.physicalName];
        if (raw === undefined || raw === null || raw === '') return 'NULL';
        const entry = dict.get(c.dictionaryId);
        if (entry && isNumericDbType(entry.dbType)) return raw;
        if (entry?.dbType === 'BOOLEAN') {
          const truthy = raw === '1' || raw.toLowerCase() === 'true';
          if (dialect === 'postgresql') return truthy ? 'TRUE' : 'FALSE';
          return truthy ? '1' : '0';
        }
        return `'${String(raw).replace(/'/g, "''")}'`;
      });
      return `  (${vals.join(', ')})`;
    }).join(',\n');

    // SQL Server: wrap with IDENTITY_INSERT when inserting explicit PK values
    const needsIdentityInsert = !skipAutoIncrementPk
      && dialect === 'sqlserver'
      && table.columns.some((c) => isAutoIncrementCol(c, dict, dialect));

    const stmt = needsIdentityInsert
      ? `SET IDENTITY_INSERT ${q(table.physicalName)} ON;\n` +
        `INSERT INTO ${q(table.physicalName)} (${colList})\nVALUES\n${rows};\n` +
        `SET IDENTITY_INSERT ${q(table.physicalName)} OFF;`
      : `INSERT INTO ${q(table.physicalName)} (${colList})\nVALUES\n${rows};`;

    stmts.push(stmt);
  }

  return stmts.join('\n\n');
}
