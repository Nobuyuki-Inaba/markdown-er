import { DiagramModel, DictionaryEntry, Table, Column } from '@shared/DiagramModel';

export function exportFullDdl(model: DiagramModel): string {
  const dict = new Map<string, DictionaryEntry>(model.dictionary.map((e) => [e.id, e]));

  const creates = model.tables.map((t) => tableToCreate(t, dict)).join('\n\n');

  const fks = model.relations
    .filter((r) => r.hasForeignKey && r.constraintName)
    .map((r) => {
      const ft = model.tables.find((t) => t.id === r.fromTableId);
      const tt = model.tables.find((t) => t.id === r.toTableId);
      const fc = ft?.columns.find((c) => c.id === r.fromColumnId);
      const tc = tt?.columns.find((c) => c.id === r.toColumnId);
      if (!ft || !tt || !fc || !tc) return null;
      return (
        `ALTER TABLE \`${tt.physicalName}\`\n` +
        `  ADD CONSTRAINT \`${r.constraintName}\`\n` +
        `  FOREIGN KEY (\`${tc.physicalName}\`)\n` +
        `  REFERENCES \`${ft.physicalName}\` (\`${fc.physicalName}\`);`
      );
    })
    .filter(Boolean)
    .join('\n\n');

  return [creates, fks].filter(Boolean).join('\n\n');
}

function tableToCreate(table: Table, dict: Map<string, DictionaryEntry>): string {
  const pkCols = table.columns.filter((c) => c.isPrimaryKey).map((c) => c.physicalName);
  const colLines = table.columns.map((col) => {
    const entry = dict.get(col.dictionaryId);
    const typePart = entry
      ? entry.length !== null ? `${entry.dbType}(${entry.length})` : entry.dbType
      : 'VARCHAR(255)';
    const nullPart = col.isNullable ? 'NULL' : 'NOT NULL';
    const def = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : '';
    return `  \`${col.physicalName}\` ${typePart} ${nullPart}${def}`;
  });
  if (pkCols.length > 0) {
    colLines.push(`  PRIMARY KEY (${pkCols.map((n) => `\`${n}\``).join(', ')})`);
  }
  return (
    `CREATE TABLE \`${table.physicalName}\` (\n` +
    colLines.join(',\n') +
    `\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );
}
