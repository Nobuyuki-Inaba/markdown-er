import { DbType, DictionaryEntry, Table, TableConstraint } from '../../../shared/DiagramModel';
import { ColumnChange, INTEGER_TYPES, SqlDialect } from '../SqlDialect';
import type { ResolvedForeignKey } from '../Schema';

/**
 * SQLite: a table-level PRIMARY KEY on a single INTEGER column is the rowid alias (auto-increment).
 * Constraints and FKs can only be declared in CREATE TABLE, so most ALTERs become notes.
 */
export class SqliteDialect extends SqlDialect {
  readonly id = 'sqlite';
  readonly label = 'SQLite';
  readonly autoIncrementTypes: readonly DbType[] = INTEGER_TYPES;
  readonly inlineForeignKeys = true;

  quote(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  protected mapType(entry: DictionaryEntry): string {
    const t = entry.dbType;
    if (INTEGER_TYPES.includes(t) || t === 'BOOLEAN') { return 'INTEGER'; }
    if (t === 'DECIMAL') { return 'NUMERIC'; }
    if (t === 'FLOAT' || t === 'DOUBLE') { return 'REAL'; }
    if (t === 'BLOB') { return 'BLOB'; }
    return 'TEXT';
  }

  /** A SQLite database is a file; only the encoding can be set, before the first table */
  createDatabase(): string[] {
    return [`PRAGMA encoding = ${this.string(this.databaseOptions().charset ?? 'UTF-8')};`];
  }

  private recreate(what: string, table: string): string {
    return this.note(`cannot ${what} on ${table}; recreate the table`);
  }

  addForeignKey(fk: ResolvedForeignKey): string {
    return this.recreate(`add foreign key ${fk.name}`, fk.child.physicalName);
  }

  dropForeignKey(fk: ResolvedForeignKey): string {
    return this.recreate(`drop foreign key ${fk.name}`, fk.child.physicalName);
  }

  addConstraint(table: Table, c: TableConstraint): string | null {
    return this.constraintClause(c) ? this.recreate(`add constraint ${c.name}`, table.physicalName) : null;
  }

  dropConstraint(table: Table, c: TableConstraint): string {
    return this.recreate(`drop constraint ${c.name}`, table.physicalName);
  }

  alterColumn(ch: ColumnChange): string[] {
    // Comments are not stored by SQLite
    if (!ch.typeChanged && !ch.nullChanged && !ch.defaultChanged && !ch.autoIncrementChanged) { return []; }
    return [this.recreate(`alter column ${ch.after.physicalName}`, ch.table.physicalName)];
  }

  changePrimaryKey(_before: Table, after: Table): string[] {
    return [this.recreate('change the primary key', after.physicalName)];
  }
}
