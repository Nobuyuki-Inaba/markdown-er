import { TypeSpec, Table, TableConstraint, TableIndex, indexName, typeSizeSuffix } from '../../../shared/DiagramModel';
import { ColumnChange, SqlDialect, commentText } from '../SqlDialect';
import type { ResolvedForeignKey } from '../Schema';

export class MySqlDialect extends SqlDialect {
  readonly id = 'mysql';
  readonly label = 'MySQL';

  protected quoteIdentifier(name: string): string {
    return `\`${name.replace(/`/g, '``')}\``;
  }

  /** MySQL keeps integer display widths such as INT(11) */
  protected sized(entry: TypeSpec): string {
    return `${entry.dbType}${typeSizeSuffix(entry)}`;
  }

  protected mapType(entry: TypeSpec, autoIncrement: boolean): string {
    if (autoIncrement) { return `${this.sized(entry)} AUTO_INCREMENT`; }
    if (entry.dbType === 'BOOLEAN') { return 'TINYINT(1)'; }
    return this.sized(entry);
  }

  /** In MySQL a schema is a database */
  createDatabase(): string[] {
    const name = this.databaseName || this.schemaName;
    if (!name) { return [this.note('set a database name to generate CREATE DATABASE')]; }
    const db = this.quote(name);
    const { charset, collation } = this.databaseOptions();
    const stmts = [
      `CREATE DATABASE IF NOT EXISTS ${db}${charset ? ` CHARACTER SET ${charset}` : ''}${collation ? ` COLLATE ${collation}` : ''};`,
    ];
    if (this.userName) {
      const user = `${this.string(this.userName)}@'%'`;
      stmts.push(
        this.changePasswordNote(),
        `CREATE USER IF NOT EXISTS ${user} IDENTIFIED BY ${this.string(this.passwordPlaceholder)};`,
        `GRANT ALL PRIVILEGES ON ${db}.* TO ${user};`,
      );
    }
    stmts.push(`USE ${db};`);
    return stmts;
  }

  protected columnCommentClause(comment: string): string {
    return comment ? ` COMMENT ${this.string(comment)}` : '';
  }

  /** Storage options follow the database character set / collation */
  protected tableOptions(table: Table): string {
    const parts: string[] = [];
    if (this.style.tableOptions) {
      const { charset, collation } = this.databaseOptions();
      parts.push('ENGINE=InnoDB', `DEFAULT CHARSET=${charset}`);
      if (collation) { parts.push(`COLLATE=${collation}`); }
    }
    const comment = commentText(table);
    if (this.style.comments && comment) { parts.push(`COMMENT=${this.string(comment)}`); }
    return parts.map((p) => ` ${p}`).join('');
  }

  renameTable(from: string, to: string): string {
    return `RENAME TABLE ${this.quote(from)} TO ${this.quote(to)};`;
  }

  dropForeignKey(fk: ResolvedForeignKey): string {
    return `ALTER TABLE ${this.quote(fk.child.physicalName)} DROP FOREIGN KEY ${this.quote(fk.name)};`;
  }

  dropIndex(table: Table, idx: TableIndex): string {
    return `DROP INDEX ${this.quote(indexName(table, idx))} ON ${this.quote(table.physicalName)};`;
  }

  /** A UNIQUE constraint is an index in MySQL */
  dropConstraint(table: Table, c: TableConstraint): string {
    const kind = c.type === 'UNIQUE' ? 'INDEX' : 'CONSTRAINT';
    return `ALTER TABLE ${this.quote(table.physicalName)} DROP ${kind} ${this.quote(c.name)};`;
  }

  changeTableComment(table: Table, comment: string): string[] {
    return [`ALTER TABLE ${this.quote(table.physicalName)} COMMENT = ${this.string(comment)};`];
  }

  /** MODIFY restates the whole column, including AUTO_INCREMENT and COMMENT */
  alterColumn(change: ColumnChange): string[] {
    return [`ALTER TABLE ${this.quote(change.table.physicalName)} MODIFY COLUMN ${change.definition};`];
  }

  changePrimaryKey(before: Table, after: Table): string[] {
    const hadPk = before.columns.some((c) => c.isPrimaryKey);
    const add = this.primaryKeyClause(after);
    const parts = [hadPk ? 'DROP PRIMARY KEY' : '', add ? `ADD ${add}` : ''].filter(Boolean);
    return [`ALTER TABLE ${this.quote(after.physicalName)} ${parts.join(', ')};`];
  }
}
