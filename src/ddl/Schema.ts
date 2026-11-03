import { Column, DiagramModel, DictionaryEntry, Relation, Table } from '../../shared/DiagramModel';
import type { SqlDialect } from './SqlDialect';

/** A FK relation with every endpoint resolved. */
export interface ResolvedForeignKey {
  relation: Relation;
  name: string;
  parent: Table;
  parentColumn: Column;
  child: Table;
  childColumn: Column;
}

/**
 * Read-only view of a DiagramModel for DDL generation:
 * dictionary lookups, auto-increment keys, resolved foreign keys and table order.
 */
export class Schema {
  readonly tables: ReadonlyMap<string, Table>;
  readonly foreignKeys: readonly ResolvedForeignKey[];
  private readonly dict: ReadonlyMap<string, DictionaryEntry>;
  private readonly autoIncrement = new Set<string>();

  constructor(readonly model: DiagramModel, dialect: SqlDialect) {
    this.tables = new Map(model.tables.map((t) => [t.id, t]));
    this.dict = new Map(model.dictionary.map((e) => [e.id, e]));
    this.foreignKeys = this.resolveForeignKeys();
    for (const t of model.tables) {
      const col = this.autoIncrementColumn(t, dialect);
      if (col) { this.autoIncrement.add(col.id); }
    }
  }

  entryOf(col: Column): DictionaryEntry | undefined {
    return this.dict.get(col.dictionaryId);
  }

  isAutoIncrement(col: Column): boolean {
    return this.autoIncrement.has(col.id);
  }

  /** Primary key columns are always NOT NULL */
  isNotNull(col: Column): boolean {
    return !col.isNullable || col.isPrimaryKey;
  }

  foreignKeysOf(childTableId: string): ResolvedForeignKey[] {
    return this.foreignKeys.filter((fk) => fk.child.id === childTableId);
  }

  /** Parent tables before child tables. Cycles keep model order. */
  tablesInDependencyOrder(): Table[] {
    const ordered: Table[] = [];
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (t: Table) => {
      if (done.has(t.id) || visiting.has(t.id)) { return; }
      visiting.add(t.id);
      for (const r of this.model.relations) {
        const parent = r.toTableId === t.id && r.fromTableId !== t.id ? this.tables.get(r.fromTableId) : undefined;
        if (parent) { visit(parent); }
      }
      visiting.delete(t.id);
      done.add(t.id);
      ordered.push(t);
    };
    this.model.tables.forEach(visit);
    return ordered;
  }

  /**
   * Only a single-column integer primary key that is not itself a foreign key
   * (e.g. the child side of a 1:1 relation) becomes auto-increment.
   * Composite keys of junction tables therefore never do.
   */
  private autoIncrementColumn(table: Table, dialect: SqlDialect): Column | undefined {
    const pk = table.columns.filter((c) => c.isPrimaryKey);
    if (pk.length !== 1) { return undefined; }
    const col = pk[0];
    const dbType = this.entryOf(col)?.dbType;
    if (!dbType || !dialect.autoIncrementTypes.includes(dbType)) { return undefined; }
    const isForeignKey = this.model.relations.some((r) => r.toTableId === table.id && r.toColumnId === col.id);
    return isForeignKey ? undefined : col;
  }

  /** Relations with "Use FK constraint" whose tables and columns all exist. Unnamed FKs get `fk_<table>_<column>`. */
  private resolveForeignKeys(): ResolvedForeignKey[] {
    const result: ResolvedForeignKey[] = [];
    for (const relation of this.model.relations) {
      if (!relation.hasForeignKey) { continue; }
      const parent = this.tables.get(relation.fromTableId);
      const child  = this.tables.get(relation.toTableId);
      const parentColumn = parent?.columns.find((c) => c.id === relation.fromColumnId);
      const childColumn  = child?.columns.find((c) => c.id === relation.toColumnId);
      if (!parent || !child || !parentColumn || !childColumn) { continue; }
      const name = relation.constraintName || `fk_${child.physicalName}_${childColumn.physicalName}`;
      result.push({ relation, name, parent, parentColumn, child, childColumn });
    }
    return result;
  }
}
