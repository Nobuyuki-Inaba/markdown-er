import { DiagramModel, DictionaryEntry, Table, Column, TableIndex } from '@shared/DiagramModel';
import type { DdlDialect } from '@shared/messages';

function quoteIdentifier(dialect: DdlDialect): (name: string) => string {
  switch (dialect) {
    case 'mysql':     return (n) => `\`${n}\``;
    case 'sqlserver': return (n) => `[${n}]`;
    default:          return (n) => `"${n}"`;
  }
}

function formatType(entry: DictionaryEntry, dialect: DdlDialect, isPk: boolean): string {
  const base = entry.dbType;
  switch (dialect) {
    case 'postgresql':
      if ((base === 'INT' || base === 'BIGINT') && isPk) { return base === 'BIGINT' ? 'BIGSERIAL' : 'SERIAL'; }
      if (base === 'BOOLEAN')  { return 'BOOLEAN'; }
      if (base === 'DATETIME') { return 'TIMESTAMP'; }
      if (base === 'TINYINT')  { return 'SMALLINT'; }
      break;
    case 'sqlite':
      if (base === 'INT' || base === 'BIGINT' || base === 'TINYINT') { return 'INTEGER'; }
      if (base === 'BOOLEAN' || base === 'DATETIME') { return base === 'BOOLEAN' ? 'INTEGER' : 'TEXT'; }
      if (['VARCHAR', 'CHAR', 'TEXT'].includes(base)) { return 'TEXT'; }
      if (['DECIMAL', 'FLOAT', 'DOUBLE'].includes(base)) { return 'REAL'; }
      return 'TEXT';
    case 'sqlserver':
      if ((base === 'INT' || base === 'BIGINT') && isPk) { return `${base} IDENTITY(1,1)`; }
      if (base === 'BOOLEAN')  { return 'BIT'; }
      if (base === 'DATETIME') { return 'DATETIME2'; }
      if (base === 'VARCHAR' && entry.length !== null) { return `NVARCHAR(${entry.length})`; }
      if (base === 'CHAR'    && entry.length !== null) { return `NCHAR(${entry.length})`; }
      break;
    case 'mysql':
      if ((base === 'INT' || base === 'BIGINT') && isPk) { return `${base} AUTO_INCREMENT`; }
      if (base === 'BOOLEAN') { return 'TINYINT(1)'; }
      break;
  }
  return entry.length !== null ? `${base}(${entry.length})` : base;
}

export function exportFullDdl(model: DiagramModel, dialect: DdlDialect = 'mysql'): string {
  const q = quoteIdentifier(dialect);
  const dict = new Map<string, DictionaryEntry>(model.dictionary.map((e) => [e.id, e]));

  const creates = model.tables.map((t) => tableToCreate(t, dict, dialect, q)).join('\n\n');

  if (dialect === 'sqlite') {
    return creates;
  }

  const indexes = model.tables.flatMap((t) =>
    (t.indexes ?? []).map((idx) => indexToSql(t, idx, q))
  ).join('\n\n');

  const fks = model.relations
    .filter((r) => r.hasForeignKey && r.constraintName)
    .map((r) => {
      const ft = model.tables.find((t) => t.id === r.fromTableId);
      const tt = model.tables.find((t) => t.id === r.toTableId);
      const fc = ft?.columns.find((c) => c.id === r.fromColumnId);
      const tc = tt?.columns.find((c) => c.id === r.toColumnId);
      if (!ft || !tt || !fc || !tc) { return null; }
      return (
        `ALTER TABLE ${q(tt.physicalName)}\n` +
        `  ADD CONSTRAINT ${q(r.constraintName)}\n` +
        `  FOREIGN KEY (${q(tc.physicalName)})\n` +
        `  REFERENCES ${q(ft.physicalName)} (${q(fc.physicalName)});`
      );
    })
    .filter(Boolean)
    .join('\n\n');

  return [creates, fks, indexes].filter(Boolean).join('\n\n');
}

function tableToCreate(
  table: Table,
  dict: Map<string, DictionaryEntry>,
  dialect: DdlDialect,
  q: (n: string) => string
): string {
  const pkCols = table.columns.filter((c) => c.isPrimaryKey).map((c) => c.physicalName);
  const colLines = table.columns.map((col) => {
    const entry = dict.get(col.dictionaryId);
    const typePart = entry
      ? formatType(entry, dialect, col.isPrimaryKey)
      : (dialect === 'sqlserver' ? 'NVARCHAR(255)' : 'VARCHAR(255)');
    const nullPart = col.isNullable ? 'NULL' : 'NOT NULL';
    const def = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : '';
    return `  ${q(col.physicalName)} ${typePart} ${nullPart}${def}`;
  });

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

  const customDdl = (table.constraints ?? [])
    .filter((c) => c.type === 'CUSTOM' && c.expression.trim())
    .map((c) => c.expression.trimEnd() + (c.expression.trimEnd().endsWith(';') ? '' : ';'))
    .join('\n');

  const trailer = dialect === 'mysql'
    ? ` ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${customDdl ? '\n' + customDdl : ''}`
    : customDdl ? '\n' + customDdl : '';

  return (
    `CREATE TABLE ${q(table.physicalName)} (\n` +
    colLines.join(',\n') +
    `\n)${trailer};`
  );
}

function indexToSql(table: Table, idx: TableIndex, q: (n: string) => string): string {
  const unique = idx.unique ? 'UNIQUE ' : '';
  const cols = idx.columns.map(q).join(', ');
  return `CREATE ${unique}INDEX ${q(idx.name)} ON ${q(table.physicalName)} (${cols});`;
}
