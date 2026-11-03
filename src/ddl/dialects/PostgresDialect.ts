import { Column, DictionaryEntry, Table } from '../../../shared/DiagramModel';
import { ColumnChange, SqlDialect, commentText } from '../SqlDialect';

export class PostgresDialect extends SqlDialect {
  readonly id = 'postgresql';
  readonly label = 'PostgreSQL';

  quote(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  booleanLiteral(value: boolean): string {
    return value ? 'TRUE' : 'FALSE';
  }

  protected mapType(entry: DictionaryEntry, autoIncrement: boolean): string {
    switch (entry.dbType) {
      case 'INT':      return autoIncrement ? 'SERIAL' : 'INT';
      case 'BIGINT':   return autoIncrement ? 'BIGSERIAL' : 'BIGINT';
      case 'TINYINT':  return 'SMALLINT';
      case 'DATETIME': return 'TIMESTAMP';
      case 'DOUBLE':   return 'DOUBLE PRECISION';
      case 'LONGTEXT': return 'TEXT';
      case 'BLOB':     return 'BYTEA';
      default:         return this.sized(entry);
    }
  }

  /** PostgreSQL has no inline comments; use COMMENT ON */
  commentStatements(table: Table, columns: Column[], includeTable: boolean): string[] {
    const t = this.quote(table.physicalName);
    const stmts: string[] = [];
    const tableComment = commentText(table);
    if (includeTable && tableComment) {
      stmts.push(`COMMENT ON TABLE ${t} IS ${this.string(tableComment)};`);
    }
    for (const col of columns) {
      const comment = commentText(col);
      if (comment) {
        stmts.push(`COMMENT ON COLUMN ${t}.${this.quote(col.physicalName)} IS ${this.string(comment)};`);
      }
    }
    return stmts;
  }

  changeTableComment(table: Table, comment: string): string[] {
    return [`COMMENT ON TABLE ${this.quote(table.physicalName)} IS ${comment ? this.string(comment) : 'NULL'};`];
  }

  /** One ALTER COLUMN per changed aspect */
  alterColumn(ch: ColumnChange): string[] {
    const t = this.quote(ch.table.physicalName);
    const c = this.quote(ch.after.physicalName);
    const stmts: string[] = [];
    if (ch.typeChanged) {
      stmts.push(`ALTER TABLE ${t} ALTER COLUMN ${c} TYPE ${ch.newType} USING ${c}::${ch.newType};`);
    }
    if (ch.nullChanged) {
      stmts.push(`ALTER TABLE ${t} ALTER COLUMN ${c} ${ch.notNull ? 'SET' : 'DROP'} NOT NULL;`);
    }
    if (ch.defaultChanged) {
      stmts.push(ch.after.defaultValue
        ? `ALTER TABLE ${t} ALTER COLUMN ${c} SET DEFAULT ${ch.after.defaultValue};`
        : `ALTER TABLE ${t} ALTER COLUMN ${c} DROP DEFAULT;`);
    }
    if (ch.commentChanged) {
      const comment = commentText(ch.after);
      stmts.push(`COMMENT ON COLUMN ${t}.${c} IS ${comment ? this.string(comment) : 'NULL'};`);
    }
    if (ch.autoIncrementChanged) {
      stmts.push(this.note(`change the sequence of ${ch.table.physicalName}.${ch.after.physicalName} manually`));
    }
    return stmts;
  }

  changePrimaryKey(before: Table, after: Table): string[] {
    const t = this.quote(after.physicalName);
    const stmts: string[] = [];
    if (before.columns.some((c) => c.isPrimaryKey)) {
      // Default name given by the original CREATE TABLE
      stmts.push(`ALTER TABLE ${t} DROP CONSTRAINT ${this.quote(`${before.physicalName}_pkey`)};`);
    }
    const add = this.primaryKeyClause(after);
    if (add) { stmts.push(`ALTER TABLE ${t} ADD ${add};`); }
    return stmts;
  }
}
