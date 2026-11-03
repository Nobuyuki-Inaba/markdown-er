import { Column, DiagramModel, Table, TableConstraint, TableIndex } from '../../shared/DiagramModel';
import type { DdlDialect } from '../../shared/messages';
import { SqlDialect, ColumnChange, commentText } from './SqlDialect';
import { Schema, ResolvedForeignKey } from './Schema';
import { isCompleteIndex } from './DdlExporter';
import { createDialect } from './createDialect';
import type { DdlStyle } from '../../shared/ddlStyle';

/**
 * ALTER script that turns `baseline` into `current`.
 * Decides *what* changed and in which order; the dialect decides the SQL.
 */
export class SchemaDiffer {
  private readonly base: Schema;
  private readonly cur: Schema;
  /** Tables that exist on both sides, as [baseline, current] */
  private readonly kept: [Table, Table][];
  private readonly stmts: string[] = [];

  static diff(baseline: DiagramModel, current: DiagramModel, dialect: DdlDialect = 'mysql', style: Partial<DdlStyle> = {}): string {
    return new SchemaDiffer(baseline, current, createDialect(dialect, current.database, style)).build();
  }

  constructor(baseline: DiagramModel, current: DiagramModel, private readonly dialect: SqlDialect) {
    this.base = new Schema(baseline, dialect);
    this.cur  = new Schema(current, dialect);
    this.kept = current.tables
      .filter((t) => this.base.tables.has(t.id))
      .map((t) => [this.base.tables.get(t.id)!, t]);
  }

  build(): string {
    // Order matters: drop dependants first, create dependants last
    this.dropForeignKeys();
    this.dropIndexesAndConstraints();
    this.dropTables();
    this.renameTables();
    this.alterColumns();
    this.createTables();
    this.addIndexesConstraintsAndComments();
    this.addForeignKeys();
    return this.stmts.length > 0 ? this.stmts.join('\n\n') : '-- No changes detected';
  }

  private push(...stmts: (string | null)[]) {
    for (const s of stmts) { if (s) { this.stmts.push(s); } }
  }

  private dropForeignKeys() {
    const curFks = new Map(this.cur.foreignKeys.map((fk) => [fk.relation.id, fk]));
    for (const bfk of this.base.foreignKeys) {
      const cfk = curFks.get(bfk.relation.id);
      if (cfk && !foreignKeyChanged(bfk, cfk)) { continue; }
      // Goes away with its table (tables are dropped child-first)
      if (!this.cur.tables.has(bfk.child.id)) { continue; }
      this.push(this.dialect.dropForeignKey(bfk));
    }
  }

  private dropIndexesAndConstraints() {
    for (const [bt, ct] of this.kept) {
      const curIdx = new Map((ct.indexes ?? []).map((i) => [i.id, i]));
      for (const bi of (bt.indexes ?? []).filter(isCompleteIndex)) {
        const ci = curIdx.get(bi.id);
        if (!ci || !sameIndex(bi, ci)) { this.push(this.dialect.dropIndex(bt, bi)); }
      }

      const curCst = new Map((ct.constraints ?? []).map((c) => [c.id, c]));
      for (const bc of bt.constraints ?? []) {
        if (!this.dialect.constraintClause(bc)) { continue; } // never part of the schema
        const cc = curCst.get(bc.id);
        if (!cc || !sameConstraint(bc, cc)) { this.push(this.dialect.dropConstraint(bt, bc)); }
      }
    }
  }

  private dropTables() {
    const dropped = this.base.tablesInDependencyOrder().reverse().filter((t) => !this.cur.tables.has(t.id));
    this.push(...dropped.map((t) => this.dialect.dropTable(t)));
  }

  private renameTables() {
    for (const [bt, ct] of this.kept) {
      if (bt.physicalName !== ct.physicalName) {
        this.push(this.dialect.renameTable(bt.physicalName, ct.physicalName));
      }
    }
  }

  private alterColumns() {
    for (const [bt, ct] of this.kept) {
      const baseCols = new Map(bt.columns.map((c) => [c.id, c]));
      const curColIds = new Set(ct.columns.map((c) => c.id));

      for (const cc of ct.columns) {
        const bc = baseCols.get(cc.id);
        if (bc && bc.physicalName !== cc.physicalName) {
          this.push(this.dialect.renameColumn(ct, bc.physicalName, cc.physicalName));
        }
      }
      for (const bc of bt.columns) {
        if (!curColIds.has(bc.id)) { this.push(this.dialect.dropColumn(ct, bc)); }
      }
      for (const cc of ct.columns) {
        if (!baseCols.has(cc.id)) { this.push(...this.dialect.addColumn(ct, cc, this.cur)); }
      }
      for (const cc of ct.columns) {
        const bc = baseCols.get(cc.id);
        const change = bc && this.columnChange(ct, bc, cc);
        if (change) { this.push(...this.dialect.alterColumn(change)); }
      }

      if (primaryKeyOf(bt) !== primaryKeyOf(ct)) {
        this.push(...this.dialect.changePrimaryKey(bt, ct));
      }
    }
  }

  private columnChange(table: Table, before: Column, after: Column): ColumnChange | null {
    const { dialect, base, cur } = this;
    // Compare dialect types, so dictionary edits are picked up and equivalent types are not
    const oldType = dialect.formatType(base.typeOf(before), false);
    const newType = dialect.formatType(cur.typeOf(after), false);
    const notNull = cur.isNotNull(after);
    const change: ColumnChange = {
      table, before, after, newType, notNull,
      newDefault:           dialect.defaultValue(after, cur),
      typeChanged:          oldType !== newType,
      nullChanged:          base.isNotNull(before) !== notNull,
      defaultChanged:       (before.defaultValue || null) !== (after.defaultValue || null),
      commentChanged:       dialect.style.comments && commentText(before) !== commentText(after),
      autoIncrementChanged: base.isAutoIncrement(before) !== cur.isAutoIncrement(after),
      isAutoIncrement:      cur.isAutoIncrement(after),
      definition:           dialect.columnDefinition(after, cur),
    };
    const changed = change.typeChanged || change.nullChanged || change.defaultChanged
      || change.commentChanged || change.autoIncrementChanged;
    return changed ? change : null;
  }

  private createTables() {
    for (const ct of this.cur.model.tables) {
      if (this.base.tables.has(ct.id)) { continue; }
      this.push(...this.dialect.createTable(ct, this.cur));
      this.push(...(ct.indexes ?? []).filter(isCompleteIndex).map((idx) => this.dialect.createIndex(ct, idx)));
    }
  }

  private addIndexesConstraintsAndComments() {
    for (const [bt, ct] of this.kept) {
      const baseIdx = new Map((bt.indexes ?? []).filter(isCompleteIndex).map((i) => [i.id, i]));
      for (const ci of (ct.indexes ?? []).filter(isCompleteIndex)) {
        const bi = baseIdx.get(ci.id);
        if (!bi || !sameIndex(bi, ci)) { this.push(this.dialect.createIndex(ct, ci)); }
      }

      const baseCst = new Map((bt.constraints ?? []).map((c) => [c.id, c]));
      const added = (ct.constraints ?? []).filter((cc) => {
        const bc = baseCst.get(cc.id);
        return !bc || !sameConstraint(bc, cc);
      });
      this.push(...added.map((c) => this.dialect.addConstraint(ct, c)));
      this.push(...this.dialect.customStatements(added));

      const comment = commentText(ct);
      if (this.dialect.style.comments && comment !== commentText(bt)) {
        this.push(...this.dialect.changeTableComment(ct, comment));
      }
    }
  }

  private addForeignKeys() {
    const baseFks = new Map(this.base.foreignKeys.map((fk) => [fk.relation.id, fk]));
    for (const cfk of this.cur.foreignKeys) {
      const bfk = baseFks.get(cfk.relation.id);
      if (bfk && !foreignKeyChanged(bfk, cfk)) { continue; }
      // Already declared inside the new table's CREATE TABLE
      if (this.dialect.inlineForeignKeys && !this.base.tables.has(cfk.child.id)) { continue; }
      this.push(this.dialect.addForeignKey(cfk));
    }
  }
}

function primaryKeyOf(t: Table): string {
  return t.columns.filter((c) => c.isPrimaryKey).map((c) => c.id).join('\0');
}

function foreignKeyChanged(a: ResolvedForeignKey, b: ResolvedForeignKey): boolean {
  return a.name !== b.name
    || a.parent.id !== b.parent.id || a.parentColumn.id !== b.parentColumn.id
    || a.child.id !== b.child.id   || a.childColumn.id !== b.childColumn.id;
}

function sameIndex(a: TableIndex, b: TableIndex): boolean {
  return a.name === b.name && a.unique === b.unique && a.columns.join('\0') === b.columns.join('\0');
}

function sameConstraint(a: TableConstraint, b: TableConstraint): boolean {
  return a.type === b.type && a.name === b.name && a.expression === b.expression;
}
