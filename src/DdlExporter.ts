import { DiagramModel, DictionaryEntry, Table, Column } from '../shared/DiagramModel';

export class DdlExporter {
  static export(model: DiagramModel): string {
    const dict = new Map<string, DictionaryEntry>(
      model.dictionary.map((e) => [e.id, e])
    );

    const creates = model.tables.map((t) => tableToCreate(t, dict)).join('\n\n');

    const fkStatements = model.relations
      .filter((r) => r.hasForeignKey && r.constraintName)
      .map((r) => {
        const fromTable = model.tables.find((t) => t.id === r.fromTableId);
        const toTable   = model.tables.find((t) => t.id === r.toTableId);
        const fromCol   = fromTable?.columns.find((c) => c.id === r.fromColumnId);
        const toCol     = toTable?.columns.find((c) => c.id === r.toColumnId);
        if (!fromTable || !toTable || !fromCol || !toCol) return null;
        return (
          `ALTER TABLE \`${toTable.physicalName}\`\n` +
          `  ADD CONSTRAINT \`${r.constraintName}\`\n` +
          `  FOREIGN KEY (\`${toCol.physicalName}\`)\n` +
          `  REFERENCES \`${fromTable.physicalName}\` (\`${fromCol.physicalName}\`);`
        );
      })
      .filter(Boolean)
      .join('\n\n');

    return [creates, fkStatements].filter(Boolean).join('\n\n');
  }
}

function tableToCreate(table: Table, dict: Map<string, DictionaryEntry>): string {
  const pkCols = table.columns.filter((c) => c.isPrimaryKey).map((c) => c.physicalName);

  const colLines = table.columns.map((col) => {
    const entry = dict.get(col.dictionaryId);
    const typePart = entry ? formatType(entry) : 'VARCHAR(255)';
    const nullPart = col.isNullable ? 'NULL' : 'NOT NULL';
    const defaultPart = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : '';
    return `  \`${col.physicalName}\` ${typePart} ${nullPart}${defaultPart}`;
  });

  if (pkCols.length > 0) {
    colLines.push(`  PRIMARY KEY (${pkCols.map((n) => `\`${n}\``).join(', ')})`);
  }

  const comment = table.comment ? ` COMMENT='${table.comment.replace(/'/g, "\\'")}'` : '';
  return (
    `CREATE TABLE \`${table.physicalName}\` (\n` +
    colLines.join(',\n') +
    `\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${comment};`
  );
}

function formatType(entry: DictionaryEntry): string {
  if (entry.length !== null) {
    return `${entry.dbType}(${entry.length})`;
  }
  return entry.dbType;
}
