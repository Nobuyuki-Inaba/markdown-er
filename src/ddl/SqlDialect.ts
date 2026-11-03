import {
  Column, DatabaseOptions, DatabaseSettings, DbType, DdlDialect, TypeSpec, Table, TableConstraint, TableIndex,
  typeSizeSuffix,
} from '../../shared/DiagramModel';
import { AUTO_INCREMENT_TYPES } from '../../shared/autoIncrement';
import { resolveDatabaseOptions } from '../../shared/databaseOptions';
import { DdlStyle, DEFAULT_DDL_STYLE } from '../../shared/ddlStyle';
import type { ResolvedForeignKey, Schema } from './Schema';

export const INTEGER_TYPES: readonly DbType[] = ['INT', 'BIGINT', 'SMALLINT', 'TINYINT'];

const PLAIN_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Keywords reserved in most databases; such names are always quoted */
const RESERVED_WORDS = new Set([
  'ALL', 'ALTER', 'AND', 'ANY', 'AS', 'ASC', 'BETWEEN', 'BY', 'CASE', 'CHECK', 'COLUMN', 'COMMENT', 'CONSTRAINT',
  'CREATE', 'CROSS', 'CURRENT', 'DATE', 'DEFAULT', 'DELETE', 'DESC', 'DISTINCT', 'DROP', 'ELSE', 'END', 'EXISTS',
  'FALSE', 'FOR', 'FOREIGN', 'FROM', 'FULL', 'GRANT', 'GROUP', 'HAVING', 'IN', 'INDEX', 'INNER', 'INSERT', 'INTO',
  'IS', 'JOIN', 'KEY', 'LEFT', 'LEVEL', 'LIKE', 'LIMIT', 'NOT', 'NULL', 'NUMBER', 'OF', 'ON', 'OR', 'ORDER', 'OUTER',
  'PRIMARY', 'REFERENCES', 'RIGHT', 'ROW', 'ROWS', 'SELECT', 'SESSION', 'SET', 'SIZE', 'TABLE', 'THEN', 'TO',
  'TRUE', 'UNION', 'UNIQUE', 'UPDATE', 'USER', 'USING', 'VALUES', 'VIEW', 'WHEN', 'WHERE', 'WITH',
]);

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
  /** Current DEFAULT expression in this dialect, or null */
  newDefault: string | null;
  /** Current type without auto-increment, e.g. for ALTER COLUMN ... TYPE */
  newType: string;
  notNull: boolean;
  typeChanged: boolean;
  nullChanged: boolean;
  defaultChanged: boolean;
  commentChanged: boolean;
  autoIncrementChanged: boolean;
  /** Current auto-increment state */
  isAutoIncrement: boolean;
  /** Full current column definition */
  definition: string;
}

/**
 * SQL generation for one database.
 *
 * The base class holds the standard SQL shared by most databases; each subclass overrides
 * only what differs. Callers (DdlExporter, SchemaDiffer) never branch on the dialect.
 * An instance is bound to the target database settings (name, schema, user, charset…).
 */
export abstract class SqlDialect {
  abstract readonly id: DdlDialect;
  /** Used in comments for statements the database cannot run */
  abstract readonly label: string;
  /** Integer types eligible for AUTO_INCREMENT / IDENTITY */
  get autoIncrementTypes(): readonly DbType[] {
    return AUTO_INCREMENT_TYPES[this.id];
  }
  /** FKs are declared inside CREATE TABLE (cannot be added later) */
  readonly inlineForeignKeys: boolean = false;

  /** Passwords are never stored in the diagram; generated DDL uses this placeholder */
  protected readonly passwordPlaceholder = 'change_me';

  constructor(
    protected readonly database?: DatabaseSettings,
    /** How the DDL is written (comments, table options, NULL, quoting) */
    readonly style: DdlStyle = DEFAULT_DDL_STYLE,
  ) {}

  /** Identifier as written in DDL: always quoted, or only when needed (style.quoteIdentifiers) */
  quote(name: string): string {
    return this.style.quoteIdentifiers || this.needsQuoting(name) ? this.quoteIdentifier(name) : name;
  }

  /** This dialect's quoting, e.g. `name` / "name" / [name] */
  protected abstract quoteIdentifier(name: string): string;

  protected needsQuoting(name: string): boolean {
    return !PLAIN_IDENTIFIER.test(name) || RESERVED_WORDS.has(name.toUpperCase());
  }

  /** Database type for a dictionary entry */
  protected abstract mapType(entry: TypeSpec, autoIncrement: boolean): string;

  /** Table reference; dialects that need a schema prefix override this */
  table(name: string): string {
    return this.quote(name);
  }

  string(s: string): string {
    return `'${s.replace(/'/g, "''")}'`;
  }

  formatType(entry: TypeSpec | undefined, autoIncrement: boolean): string {
    return entry ? this.mapType(entry, autoIncrement) : this.defaultType();
  }

  booleanLiteral(value: boolean): string {
    return value ? '1' : '0';
  }

  protected defaultType(): string {
    return 'VARCHAR(255)';
  }

  /** Type with size, e.g. VARCHAR(100) / DECIMAL(10,2). Integer display widths are dropped. */
  protected sized(entry: TypeSpec): string {
    return INTEGER_TYPES.includes(entry.dbType) ? entry.dbType : `${entry.dbType}${typeSizeSuffix(entry)}`;
  }

  protected note(message: string): string {
    return `-- ${this.label}: ${message}`;
  }

  // ── DATABASE / USER / SCHEMA ─────────────────────────────────────────

  /**
   * DEFAULT expression as written by the user, except that true/false/1/0 on a BOOLEAN
   * column become this dialect's boolean literal (TRUE is invalid for BIT / NUMBER(1)).
   */
  defaultValue(col: Column, schema: Schema): string | null {
    const raw = col.defaultValue?.trim();
    if (!raw) { return null; }
    if (schema.typeOf(col)?.dbType === 'BOOLEAN' && /^(true|false|1|0)$/i.test(raw)) {
      return this.booleanLiteral(/^(true|1)$/i.test(raw));
    }
    return raw;
  }

  /** Statements that create the database, user and schema and switch to them */
  abstract createDatabase(): string[];

  /** This dialect's CREATE DATABASE options with defaults applied */
  databaseOptions(): DatabaseOptions {
    return resolveDatabaseOptions(this.id, this.database?.options[this.id]);
  }

  protected get databaseName(): string { return this.database?.name?.trim() ?? ''; }
  protected get schemaName(): string { return this.database?.schema?.trim() ?? ''; }
  protected get userName(): string { return this.database?.user?.trim() ?? ''; }

  protected changePasswordNote(): string {
    return this.note(`replace the password '${this.passwordPlaceholder}' before running`);
  }

  // ── CREATE ───────────────────────────────────────────────────────────

  /** `name TYPE [DEFAULT x] NULL|NOT NULL` — DEFAULT first, as Oracle requires and the others accept */
  columnDefinition(col: Column, schema: Schema): string {
    const type = this.formatType(schema.typeOf(col), schema.isAutoIncrement(col));
    const defaultSql = this.defaultValue(col, schema);
    const defaultPart = defaultSql ? ` DEFAULT ${defaultSql}` : '';
    const nullPart = schema.isNotNull(col) ? ' NOT NULL' : this.style.explicitNull ? ' NULL' : '';
    const commentPart = this.style.comments ? this.columnCommentClause(commentText(col)) : '';
    return `${this.quote(col.physicalName)} ${type}${defaultPart}${nullPart}${commentPart}`;
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

    const create = `CREATE TABLE ${this.table(table.physicalName)} (\n${lines.join(',\n')}\n)${this.tableOptions(table)};`;
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
    return `CREATE ${unique}INDEX ${this.quote(idx.name)} ON ${this.table(table.physicalName)} (${cols});`;
  }

  addForeignKey(fk: ResolvedForeignKey): string {
    return (
      `ALTER TABLE ${this.table(fk.child.physicalName)}\n` +
      `  ADD CONSTRAINT ${this.quote(fk.name)}\n` +
      `  FOREIGN KEY (${this.quote(fk.childColumn.physicalName)})\n` +
      `  REFERENCES ${this.table(fk.parent.physicalName)} (${this.quote(fk.parentColumn.physicalName)});`
    );
  }

  /** Comment statements for databases without inline comments (see commentOnStatements) */
  commentStatements(_table: Table, _columns: Column[], _includeTable: boolean): string[] {
    return [];
  }

  /** A multi-row INSERT; `rows` are ready-made `(v1, v2)` tuples */
  insertStatement(table: Table, columns: Column[], rows: string[]): string {
    const cols = columns.map((c) => this.quote(c.physicalName)).join(', ');
    return `INSERT INTO ${this.table(table.physicalName)} (${cols})\nVALUES\n${rows.map((r) => `  ${r}`).join(',\n')};`;
  }

  /** Hook for INSERTs that set an auto-increment column explicitly */
  wrapExplicitIdentityInsert(_table: Table, _identity: Column, insert: string): string {
    return insert;
  }

  protected primaryKeyClause(table: Table): string | null {
    const pk = table.columns.filter((c) => c.isPrimaryKey);
    return pk.length > 0 ? `PRIMARY KEY (${pk.map((c) => this.quote(c.physicalName)).join(', ')})` : null;
  }

  protected foreignKeyClause(fk: ResolvedForeignKey): string {
    return (
      `CONSTRAINT ${this.quote(fk.name)} FOREIGN KEY (${this.quote(fk.childColumn.physicalName)}) ` +
      `REFERENCES ${this.table(fk.parent.physicalName)} (${this.quote(fk.parentColumn.physicalName)})`
    );
  }

  protected columnCommentClause(_comment: string): string {
    return '';
  }

  protected tableOptions(_table: Table): string {
    return '';
  }

  /** Standard `COMMENT ON TABLE / COLUMN` (PostgreSQL, Oracle) */
  protected commentOnStatements(table: Table, columns: Column[], includeTable: boolean): string[] {
    if (!this.style.comments) { return []; }
    const stmts: string[] = [];
    const tableComment = commentText(table);
    if (includeTable && tableComment) {
      stmts.push(this.commentOnTable(table, tableComment));
    }
    for (const col of columns) {
      const comment = commentText(col);
      if (comment) { stmts.push(this.commentOnColumn(table, col, comment)); }
    }
    return stmts;
  }

  /** An empty comment removes it */
  protected commentOnTable(table: Table, comment: string): string {
    return `COMMENT ON TABLE ${this.table(table.physicalName)} IS ${this.commentLiteral(comment)};`;
  }

  protected commentOnColumn(table: Table, col: Column, comment: string): string {
    return `COMMENT ON COLUMN ${this.table(table.physicalName)}.${this.quote(col.physicalName)} IS ${this.commentLiteral(comment)};`;
  }

  private commentLiteral(comment: string): string {
    return comment ? this.string(comment) : 'NULL';
  }

  // ── ALTER ────────────────────────────────────────────────────────────

  /** The new name is never schema-qualified */
  renameTable(from: string, to: string): string {
    return `ALTER TABLE ${this.table(from)} RENAME TO ${this.quote(to)};`;
  }

  renameColumn(table: Table, from: string, to: string): string {
    return `ALTER TABLE ${this.table(table.physicalName)} RENAME COLUMN ${this.quote(from)} TO ${this.quote(to)};`;
  }

  addColumn(table: Table, col: Column, schema: Schema): string[] {
    return [
      `ALTER TABLE ${this.table(table.physicalName)} ADD COLUMN ${this.columnDefinition(col, schema)};`,
      ...this.commentStatements(table, [col], false),
    ];
  }

  dropColumn(table: Table, col: Column): string {
    return `ALTER TABLE ${this.table(table.physicalName)} DROP COLUMN ${this.quote(col.physicalName)};`;
  }

  dropTable(table: Table): string {
    return `DROP TABLE IF EXISTS ${this.table(table.physicalName)};`;
  }

  dropForeignKey(fk: ResolvedForeignKey): string {
    return `ALTER TABLE ${this.table(fk.child.physicalName)} DROP CONSTRAINT ${this.quote(fk.name)};`;
  }

  dropIndex(_table: Table, idx: TableIndex): string {
    return `DROP INDEX ${this.quote(idx.name)};`;
  }

  addConstraint(table: Table, c: TableConstraint): string | null {
    const clause = this.constraintClause(c);
    return clause ? `ALTER TABLE ${this.table(table.physicalName)} ADD ${clause};` : null;
  }

  dropConstraint(table: Table, c: TableConstraint): string {
    return `ALTER TABLE ${this.table(table.physicalName)} DROP CONSTRAINT ${this.quote(c.name)};`;
  }

  changeTableComment(_table: Table, _comment: string): string[] {
    return [];
  }

  abstract alterColumn(change: ColumnChange): string[];

  /** `before` is the baseline table (original names), `after` the current one */
  abstract changePrimaryKey(before: Table, after: Table): string[];
}
