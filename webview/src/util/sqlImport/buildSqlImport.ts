import {
  Cardinality, Column, DbType, DdlDialect, DiagramModel, Relation, Table, TableConstraint, TableIndex,
} from '@shared/DiagramModel';
import { genId } from '../idgen';
import { ParsedColumn, ParsedForeignKey, ParsedTable, SqlWarning, SqlWarningCode, parseSql } from './SqlParser';

export interface SqlImport {
  /** New tables, with their seed data */
  tables: Table[];
  relations: Relation[];
  /** Rows for tables already in the diagram */
  existingSeedRows: { tableId: string; rows: Record<string, string>[] }[];
  /** Already in the diagram, so their definitions were not imported */
  skippedTableNames: string[];
  warnings: SqlWarning[];
}

const INTEGER_TYPES: readonly DbType[] = ['INT', 'BIGINT', 'SMALLINT', 'TINYINT'];

/** An `INTEGER PRIMARY KEY` is an alias of the rowid here, so it auto-increments with no keyword */
const IMPLICIT_AUTO_INCREMENT: readonly DdlDialect[] = ['sqlite'];

const lower = (name: string) => name.toLowerCase();

/** The reverse of the exporter's `commentText()`: `logical name: comment`, or just a logical name */
function splitComment(physicalName: string, text: string): { logicalName: string; comment: string } {
  if (!text) { return { logicalName: physicalName, comment: '' }; }
  const separator = text.indexOf(': ');
  if (separator < 0) { return { logicalName: text, comment: '' }; }
  return { logicalName: text.slice(0, separator), comment: text.slice(separator + 2) };
}

class SqlImportBuilder {
  private readonly warnings: SqlWarning[];
  private readonly newTables = new Map<string, Table>();
  private readonly existing: Map<string, Table>;
  private readonly relations: Relation[] = [];
  private readonly existingSeedRows: SqlImport['existingSeedRows'] = [];
  private readonly skippedTableNames: string[] = [];

  constructor(
    private readonly parsedTables: ParsedTable[],
    warnings: SqlWarning[],
    private readonly model: DiagramModel,
    private readonly dialect: DdlDialect,
  ) {
    this.warnings = [...warnings];
    this.existing = new Map(model.tables.map((t) => [lower(t.physicalName), t]));
  }

  private warn(code: SqlWarningCode, subject: string) {
    if (!this.warnings.some((w) => w.code === code && w.subject === subject)) {
      this.warnings.push({ code, subject });
    }
  }

  build(): SqlImport {
    for (const parsed of this.parsedTables) {
      if (this.existing.has(lower(parsed.name))) {
        if (parsed.declared) { this.skippedTableNames.push(parsed.name); }
      } else if (parsed.declared) {
        this.newTables.set(lower(parsed.name), this.table(parsed));
      } else {
        this.warn('tableNotFound', parsed.name);
      }
    }
    for (const parsed of this.parsedTables) {
      const table = this.resolve(parsed.name);
      if (!table) { continue; }
      parsed.foreignKeys.forEach((fk) => this.relationsOf(fk, table));
      this.seedRows(parsed, table);
    }
    return {
      tables: [...this.newTables.values()],
      relations: this.relations,
      existingSeedRows: this.existingSeedRows,
      skippedTableNames: this.skippedTableNames,
      warnings: this.warnings,
    };
  }

  private resolve(name: string): Table | undefined {
    return this.newTables.get(lower(name)) ?? this.existing.get(lower(name));
  }

  private table(parsed: ParsedTable): Table {
    const primaryKey = new Set(parsed.primaryKey.map(lower));
    const columns = parsed.columns.map((c) => this.column(parsed, c, primaryKey));
    const known = (name: string) => {
      const found = columns.some((c) => lower(c.physicalName) === lower(name));
      if (!found) { this.warn('columnNotFound', `${parsed.name}.${name}`); }
      return found;
    };
    parsed.primaryKey.forEach(known);

    const indexes: TableIndex[] = parsed.indexes
      .filter((i) => i.columns.every(known))
      .map((i) => ({
        id: genId('idx'),
        name: i.name,
        columns: i.columns,
        unique: i.unique,
      }));
    const constraints: TableConstraint[] = [
      ...parsed.uniques.filter((u) => u.columns.every(known)).map((u): TableConstraint => ({
        id: genId('cns'),
        type: 'UNIQUE',
        name: u.name || `uq_${parsed.name}_${u.columns.join('_')}`,
        expression: u.columns.join(', '),
      })),
      ...parsed.checks.map((c, i): TableConstraint => ({
        id: genId('cns'),
        type: 'CHECK',
        name: c.name || `ck_${parsed.name}_${i + 1}`,
        expression: c.expression,
      })),
    ];

    return {
      id: genId('tbl'),
      physicalName: parsed.name,
      ...splitComment(parsed.name, parsed.comment),
      columns,
      ...(indexes.length > 0 ? { indexes } : {}),
      ...(constraints.length > 0 ? { constraints } : {}),
    };
  }

  private column(table: ParsedTable, parsed: ParsedColumn, primaryKey: Set<string>): Column {
    const subject = `${table.name}.${parsed.name}`;
    const { spec, approximated } = parsed.type;
    if (approximated) { this.warn('typeApproximated', `${subject}: ${parsed.typeText} → ${spec.dbType}`); }
    if (parsed.computed) { this.warn('computedColumn', subject); }

    const isPrimaryKey = parsed.primaryKey || primaryKey.has(lower(parsed.name));
    const column: Column = {
      id: genId('col'),
      physicalName: parsed.name,
      ...splitComment(parsed.name, parsed.comment),
      dictionaryId: '',
      type: spec,
      isPrimaryKey,
      isNullable: !parsed.notNull && !isPrimaryKey,
      defaultValue: parsed.defaultValue,
    };
    const integerKey = isPrimaryKey && INTEGER_TYPES.includes(spec.dbType);
    if (parsed.autoIncrement && !integerKey) {
      this.warn('autoIncrementIgnored', subject);
    } else if (parsed.autoIncrement) {
      column.autoIncrement = true;
    } else if (integerKey && primaryKey.size === 1 && !IMPLICIT_AUTO_INCREMENT.includes(this.dialect)) {
      // The default rule would auto-increment this key
      column.autoIncrement = false;
    }
    return column;
  }

  private relationsOf(fk: ParsedForeignKey, child: Table) {
    const subject = `${child.physicalName} (${fk.columns.join(', ')}) → ${fk.parentTable}`;
    const parent = this.resolve(fk.parentTable);
    if (!parent) { return this.warn('foreignKeyUnresolved', subject); }

    const parentColumns = fk.parentColumns.length > 0
      ? fk.parentColumns
      : parent.columns.filter((c) => c.isPrimaryKey).map((c) => c.physicalName);
    if (parentColumns.length !== fk.columns.length) { return this.warn('foreignKeyUnresolved', subject); }

    const pairs = fk.columns.map((name, i) => ({
      childColumn: child.columns.find((c) => lower(c.physicalName) === lower(name)),
      parentColumn: parent.columns.find((c) => lower(c.physicalName) === lower(parentColumns[i])),
    }));
    if (pairs.some((p) => !p.childColumn || !p.parentColumn)) { return this.warn('foreignKeyUnresolved', subject); }

    // A relation is one column pair: a composite key can only be kept as logical relations
    const composite = pairs.length > 1;
    if (composite) { this.warn('compositeForeignKey', subject); }
    if (fk.actions) { this.warn('foreignKeyAction', `${subject}: ${fk.actions}`); }

    for (const { childColumn, parentColumn } of pairs) {
      const known = [...this.model.relations, ...this.relations].some((r) =>
        r.fromTableId === parent.id && r.fromColumnId === parentColumn!.id
        && r.toTableId === child.id && r.toColumnId === childColumn!.id);
      if (known) { continue; }
      this.relations.push({
        id: genId('rel'),
        fromTableId: parent.id,
        fromColumnId: parentColumn!.id,
        toTableId: child.id,
        toColumnId: childColumn!.id,
        cardinality: this.cardinality(child, childColumn!),
        hasForeignKey: !composite,
        constraintName: fk.name,
        comment: fk.actions,
      });
    }
  }

  /** One row per parent when the child column is unique by itself */
  private cardinality(child: Table, column: Column): Cardinality {
    const keys = child.columns.filter((c) => c.isPrimaryKey);
    const isKey = keys.length === 1 && keys[0].id === column.id;
    const isUnique = child.constraints?.some((c) => c.type === 'UNIQUE' && lower(c.expression) === lower(column.physicalName));
    return isKey || isUnique ? 'ONE_TO_ONE' : 'ONE_TO_MANY';
  }

  private seedRows(parsed: ParsedTable, table: Table) {
    const rows: Record<string, string>[] = [];
    for (const insert of parsed.inserts) {
      const names = insert.columns.length > 0 ? insert.columns : table.columns.map((c) => c.physicalName);
      const targets = names.map((name) => {
        const column = table.columns.find((c) => lower(c.physicalName) === lower(name));
        if (!column) { this.warn('columnNotFound', `${table.physicalName}.${name}`); }
        return column;
      });
      for (const values of insert.rows) {
        if (values.length !== 0 && values.length !== names.length) {
          this.warn('rowSkipped', table.physicalName);
          continue;
        }
        const row = Object.fromEntries(table.columns.map((c) => [c.physicalName, '']));
        values.forEach((value, i) => {
          const column = targets[i];
          if (!column) { return; }
          row[column.physicalName] = value.value;
          if (value.expression) { this.warn('seedExpression', `${table.physicalName}.${column.physicalName}: ${value.value}`); }
        });
        rows.push(row);
      }
    }
    if (rows.length === 0) { return; }
    if (this.newTables.has(lower(table.physicalName))) {
      table.seedData = rows;
    } else {
      this.existingSeedRows.push({ tableId: table.id, rows });
    }
  }
}

/**
 * Turns a DDL / DML script into what it adds to `model`.
 * Tables already in the diagram keep their definition; their foreign keys and INSERT rows still apply.
 */
export function buildSqlImport(source: string, model: DiagramModel, dialect: DdlDialect): SqlImport {
  const { tables, warnings } = parseSql(source, dialect);
  return new SqlImportBuilder(tables, warnings, model, dialect).build();
}
