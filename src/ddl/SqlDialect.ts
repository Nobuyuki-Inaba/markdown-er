import {
  Column, DbType, DictionaryEntry, Table, TableConstraint, TableIndex, typeSizeSuffix,
} from '../../shared/DiagramModel';
import type { DdlDialect } from '../../shared/messages';
import type { ResolvedForeignKey, Schema } from './Schema';

export const INTEGER_TYPES: readonly DbType[] = ['INT', 'BIGINT', 'SMALLINT', 'TINYINT'];

/** Comment for a table or column: logical name (when it differs) + free comment. */
export function commentText(item: { logicalName: string; physicalName: string; comment: string }): string {
  const parts: string[] = [];
  if (item.logicalName && item.logicalName !== item.physicalName) { parts.push(item.logicalName); }
  if (item.comment) { parts.push(item.comment); }
  return parts.join(': ');
}

/** What changed in one column. Computed by SchemaDiffer, turned into SQL by the dialect. */
export interface ColumnChange {
  /** Current table (after renames) */
  table: Table;
  before: Column;
  after: Column;
  /** Current type without auto-increment, e.g. for ALTER COLUMN ... TYPE */
  newType: string;
  notNull: boolean;
  typeChanged: boolean;
  nullChanged: boolean;
  defaultChanged: boolean;
  commentChanged: boolean;
  autoIncrementChanged: boolean;
  /** Full current column definition */
  definition: string;
}

/**
 * SQL generation for one database.
 *
 * The base class holds the standard SQL shared by most databases; each subclass overrides
 * only what differs. Callers (DdlExporter, SchemaDiffer) never branch on the dialect.
 */
export abstract class SqlDialect {
  abstract readonly id: DdlDialect;
  /** Used in comments for statements the database cannot run */
  abstract readonly label: string;
  /** Integer types eligible for AUTO_INCREMENT / SERIAL / IDENTITY */
  readonly autoIncrementTypes: readonly DbType[] = ['INT', 'BIGINT'];
  /** FKs are declared inside CREATE TABLE (cannot be added later) */
  readonly inlineForeignKeys: boolean = false;

  abstract quote(name: string): string;

  /** Database type for a dictionary entry */
  protected abstract mapType(entry: DictionaryEntry, autoIncrement: boolean): string;

  string(s: string): string {
    return `'${s.replace(/'/g, "''")}'`;
  }

  formatType(entry: DictionaryEntry | undefined, autoIncrement: boolean): string {
    return entry ? this.mapType(entry, autoIncrement) : this.defaultType();
  }

  booleanLiteral(value: boolean): string {
    return value ? '1' : '0';
  }

  protected defaultType(): string {
    return 'VARCHAR(255)';
  }

  /** Type with size, e.g. VARCHAR(100) / DECIMAL(10,2). Integer display widths are dropped. */
  protected sized(entry: DictionaryEntry): string {
    return INTEGER_TYPES.includes(entry.dbType) ? entry.dbType : `${entry.dbType}${typeSizeSuffix(entry)}`;
  }

  protected note(message: string): string {
    return `-- ${this.label}: ${message}`;
  }

  // ── CREATE ───────────────────────────────────────────────────────────

  columnDefinition(col: Column, schema: Schema): string {
    const type = this.formatType(schema.entryOf(col), schema.isAutoIncrement(col));
    const nullPart = schema.isNotNull(col) ? 'NOT NULL' : 'NULL';
    const defaultPart = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : '';
    return `${this.quote(col.physicalName)} ${type} ${nullPart}${defaultPart}${this.columnCommentClause(commentText(col))}`;
  }

  /** CREATE TABLE plus the statements that belong to it (comments, custom DDL). */
  createTable(table: Table, schema: Schema): string[] {
    const lines = table.columns.map((col) => `  ${this.columnDefinition(col, schema)}`);

    const pk = this.primaryKeyClause(table);
    if (pk) { lines.push(`  ${pk}`); }

    for (const c of table.constraints ?? []) {
      const clause = this.constraintClause(c);
      if (clause) { lines.push(`  ${clause}`); }
    }

    if (this.inlineForeignKeys) {
      for (const fk of schema.foreignKeysOf(table.id)) {
        lines.push(`  ${this.foreignKeyClause(fk)}`);
      }
    }

    const create = `CREATE TABLE ${this.quote(table.physicalName)} (\n${lines.join(',\n')}\n)${this.tableOptions(table)};`;
    return [create, ...this.commentStatements(table, table.columns, true), ...this.customStatements(table.constraints ?? [])];
  }

  /** `CONSTRAINT name UNIQUE (...)` / `CONSTRAINT name CHECK (...)`; null for CUSTOM or incomplete ones */
  constraintClause(c: TableConstraint): string | null {
    if (!c.name || !c.expression) { return null; }
    if (c.type === 'UNIQUE') {
      const cols = c.expression.split(',').map((s) => this.quote(s.trim())).join(', ');
      return `CONSTRAINT ${this.quote(c.name)} UNIQUE (${cols})`;
    }
    if (c.type === 'CHECK') {
      return `CONSTRAINT ${this.quote(c.name)} CHECK (${c.expression})`;
    }
    return null;
  }

  /** CUSTOM constraints are raw statements written by the user */
  customStatements(constraints: TableConstraint[]): string[] {
    return constraints
      .filter((c) => c.type === 'CUSTOM' && c.expression.trim())
      .map((c) => {
        const sql = c.expression.trim();
        return sql.endsWith(';') ? sql : `${sql};`;
      });
  }

  createIndex(table: Table, idx: TableIndex): string {
    const unique = idx.unique ? 'UNIQUE ' : '';
    const cols = idx.columns.map((c) => this.quote(c)).join(', ');
    return `CREATE ${unique}INDEX ${this.quote(idx.name)} ON ${this.quote(table.physicalName)} (${cols});`;
  }

  addForeignKey(fk: ResolvedForeignKey): string {
    const q = (n: string) => this.quote(n);
    return (
      `ALTER TABLE ${q(fk.child.physicalName)}\n` +
      `  ADD CONSTRAINT ${q(fk.name)}\n` +
      `  FOREIGN KEY (${q(fk.childColumn.physicalName)})\n` +
      `  REFERENCES ${q(fk.parent.physicalName)} (${q(fk.parentColumn.physicalName)});`
    );
  }

  /** Comment statements for databases without inline comments (see PostgresDialect) */
  commentStatements(_table: Table, _columns: Column[], _includeTable: boolean): string[] {
    return [];
  }

  /** Hook for INSERTs that set an auto-increment column explicitly (see SqlServerDialect) */
  wrapExplicitIdentityInsert(_table: Table, insert: string): string {
    return insert;
  }

  protected primaryKeyClause(table: Table): string | null {
    const pk = table.columns.filter((c) => c.isPrimaryKey);
    return pk.length > 0 ? `PRIMARY KEY (${pk.map((c) => this.quote(c.physicalName)).join(', ')})` : null;
  }

  protected foreignKeyClause(fk: ResolvedForeignKey): string {
    return (
      `CONSTRAINT ${this.quote(fk.name)} FOREIGN KEY (${this.quote(fk.childColumn.physicalName)}) ` +
      `REFERENCES ${this.quote(fk.parent.physicalName)} (${this.quote(fk.parentColumn.physicalName)})`
    );
  }

  protected columnCommentClause(_comment: string): string {
    return '';
  }

  protected tableOptions(_table: Table): string {
    return '';
  }

  // ── ALTER ────────────────────────────────────────────────────────────

  renameTable(from: string, to: string): string {
    return `ALTER TABLE ${this.quote(from)} RENAME TO ${this.quote(to)};`;
  }

  renameColumn(table: Table, from: string, to: string): string {
    return `ALTER TABLE ${this.quote(table.physicalName)} RENAME COLUMN ${this.quote(from)} TO ${this.quote(to)};`;
  }

  addColumn(table: Table, col: Column, schema: Schema): string[] {
    return [
      `ALTER TABLE ${this.quote(table.physicalName)} ADD COLUMN ${this.columnDefinition(col, schema)};`,
      ...this.commentStatements(table, [col], false),
    ];
  }

  dropColumn(table: Table, col: Column): string {
    return `ALTER TABLE ${this.quote(table.physicalName)} DROP COLUMN ${this.quote(col.physicalName)};`;
  }

  dropTable(table: Table): string {
    return `DROP TABLE IF EXISTS ${this.quote(table.physicalName)};`;
  }

  dropForeignKey(fk: ResolvedForeignKey): string {
    return `ALTER TABLE ${this.quote(fk.child.physicalName)} DROP CONSTRAINT ${this.quote(fk.name)};`;
  }

  dropIndex(_table: Table, idx: TableIndex): string {
    return `DROP INDEX ${this.quote(idx.name)};`;
  }

  addConstraint(table: Table, c: TableConstraint): string | null {
    const clause = this.constraintClause(c);
    return clause ? `ALTER TABLE ${this.quote(table.physicalName)} ADD ${clause};` : null;
  }

  dropConstraint(table: Table, c: TableConstraint): string {
    return `ALTER TABLE ${this.quote(table.physicalName)} DROP CONSTRAINT ${this.quote(c.name)};`;
  }

  changeTableComment(_table: Table, _comment: string): string[] {
    return [];
  }

  abstract alterColumn(change: ColumnChange): string[];

  /** `before` is the baseline table (original names), `after` the current one */
  abstract changePrimaryKey(before: Table, after: Table): string[];
}
