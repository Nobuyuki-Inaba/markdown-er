import {
  Cardinality, Column, DiagramModel, DictionaryEntry, columnTypeSpec, formatTypeSpec,
} from '../../shared/DiagramModel';
import type { Locale } from '../../shared/messages';

/** Readable Markdown generated into the .ermd file, so it can be read without the extension */
export interface MarkdownDocsOptions {
  /** Mermaid `erDiagram` block */
  mermaid: boolean;
  /** One Markdown table of columns per table */
  tableDocs: boolean;
  locale: Locale;
}

const LABELS = {
  en: {
    diagram: 'ER Diagram',
    tables: 'Table Definitions',
    no: '#', logicalName: 'Logical name', physicalName: 'Physical name', type: 'Type',
    pk: 'PK', notNull: 'Not null', defaultValue: 'Default', comment: 'Comment',
  },
  ja: {
    diagram: 'ER 図',
    tables: 'テーブル定義',
    no: '#', logicalName: '論理名', physicalName: '物理名', type: '型',
    pk: 'PK', notNull: 'NOT NULL', defaultValue: '既定値', comment: 'コメント',
  },
} satisfies Record<Locale, Record<string, string>>;

/** The generated Markdown, or undefined when both parts are off */
export function generateMarkdownDocs(model: DiagramModel, options: MarkdownDocsOptions): string | undefined {
  if (!options.mermaid && !options.tableDocs) { return undefined; }
  const l = LABELS[options.locale];
  const parts: string[] = [];
  if (options.mermaid) {
    parts.push(`## ${l.diagram}\n\n\`\`\`mermaid\n${mermaidErDiagram(model)}\n\`\`\``);
  }
  if (options.tableDocs) {
    parts.push(`## ${l.tables}`, ...model.tables.map((t) => tableDoc(t, model.dictionary, l)));
  }
  return parts.join('\n\n');
}

const MERMAID_CARDINALITY: Record<Cardinality, string> = {
  ONE_TO_ONE: '||--||',
  ONE_TO_MANY: '||--o{',
  MANY_TO_MANY: '}o--o{',
};

export function mermaidErDiagram(model: DiagramModel): string {
  const names = mermaidEntityNames(model);
  const fkColumns = new Set(model.relations.filter((r) => r.hasForeignKey).map((r) => r.toColumnId));
  const lines = ['erDiagram'];
  for (const table of model.tables) {
    lines.push(`  ${names.get(table.id)} {`);
    for (const col of table.columns) {
      const keys = [col.isPrimaryKey ? 'PK' : '', fkColumns.has(col.id) ? 'FK' : ''].filter(Boolean).join(', ');
      const label = col.logicalName && col.logicalName !== col.physicalName ? ` "${mermaidText(col.logicalName)}"` : '';
      lines.push(`    ${mermaidType(col, model.dictionary)} ${mermaidIdentifier(col.physicalName, 'column')}${keys ? ` ${keys}` : ''}${label}`);
    }
    lines.push('  }');
  }
  for (const rel of model.relations) {
    const from = names.get(rel.fromTableId);
    const to = names.get(rel.toTableId);
    if (!from || !to) { continue; }
    lines.push(`  ${from} ${MERMAID_CARDINALITY[rel.cardinality]} ${to} : "${mermaidText(rel.constraintName)}"`);
  }
  return lines.join('\n');
}

/** Unique Mermaid entity names derived from the physical names */
function mermaidEntityNames(model: DiagramModel): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const table of model.tables) {
    const base = mermaidIdentifier(table.physicalName, 'table');
    let name = base;
    for (let i = 2; used.has(name); i++) { name = `${base}_${i}`; }
    used.add(name);
    names.set(table.id, name);
  }
  return names;
}

/** Mermaid names allow only letters, digits, `_` and `-` */
function mermaidIdentifier(name: string, fallback: string): string {
  const id = name.replace(/[^A-Za-z0-9_-]/g, '_');
  if (!id) { return fallback; }
  return /^[A-Za-z_]/.test(id) ? id : `_${id}`;
}

/** The base type only: Mermaid can't parse sizes like DECIMAL(10,2) (the table docs show them) */
function mermaidType(col: Column, dictionary: DictionaryEntry[]): string {
  return columnTypeSpec(col, dictionary)?.dbType ?? 'unknown';
}

function mermaidText(text: string): string {
  return text.replace(/"/g, "'").replace(/\r?\n/g, ' ');
}

function tableDoc(table: DiagramModel['tables'][number], dictionary: DictionaryEntry[], l: typeof LABELS['en']): string {
  const title = table.logicalName && table.logicalName !== table.physicalName
    ? `${table.physicalName} (${table.logicalName})`
    : table.physicalName;
  const lines = [`### ${cell(title)}`, ''];
  if (table.comment) { lines.push(cell(table.comment), ''); }
  lines.push(
    `| ${l.no} | ${l.logicalName} | ${l.physicalName} | ${l.type} | ${l.pk} | ${l.notNull} | ${l.defaultValue} | ${l.comment} |`,
    '|---:|---|---|---|:---:|:---:|---|---|',
  );
  table.columns.forEach((col, i) => {
    const spec = columnTypeSpec(col, dictionary);
    lines.push(`| ${[
      String(i + 1),
      cell(col.logicalName),
      cell(col.physicalName),
      spec ? formatTypeSpec(spec) : '',
      col.isPrimaryKey ? '✓' : '',
      col.isPrimaryKey || !col.isNullable ? '✓' : '',
      cell(col.defaultValue ?? ''),
      cell(col.comment),
    ].join(' | ')} |`);
  });
  return lines.join('\n');
}

/** Text that is safe inside a Markdown table cell */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}
