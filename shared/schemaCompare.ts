import {
  Column, DiagramModel, Relation, SchemaVersion, Table, columnTypeSpec, constraintName, formatTypeSpec, indexName,
} from './DiagramModel';
import { productionModel } from './testData';

/** What a schema comparison looks at */
export type ComparableSchema = Pick<DiagramModel, 'tables' | 'relations' | 'dictionary'>;

export type ChangeKind = 'added' | 'removed' | 'changed';

export type ChangedField =
  | 'physicalName' | 'logicalName' | 'comment' | 'seedRows'
  | 'type' | 'nullable' | 'primaryKey' | 'autoIncrement' | 'defaultValue'
  | 'columns' | 'unique' | 'expression' | 'name'
  | 'cardinality' | 'foreignKey';

export interface FieldChange {
  field: ChangedField;
  before: string;
  after: string;
}

/** A column, index, constraint or relation that was added, removed or changed */
export interface ItemChange {
  kind: ChangeKind;
  name: string;
  /** Only for `changed` */
  fields: FieldChange[];
}

export interface TableChange extends ItemChange {
  columns: ItemChange[];
  indexes: ItemChange[];
  constraints: ItemChange[];
}

export interface SchemaComparison {
  tables: TableChange[];
  relations: ItemChange[];
}

type Described = { name: string; values: Partial<Record<ChangedField, string>> };

/** Compares two lists by id; the same id in both is the same item, even when renamed */
function compareItems<T extends { id: string }>(
  before: T[],
  after: T[],
  describeBefore: (item: T) => Described,
  describeAfter: (item: T) => Described = describeBefore,
): ItemChange[] {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterIds = new Set(after.map((item) => item.id));
  const changes: ItemChange[] = before
    .filter((item) => !afterIds.has(item.id))
    .map((item) => ({ kind: 'removed', name: describeBefore(item).name, fields: [] }));
  for (const item of after) {
    const previous = beforeById.get(item.id);
    if (!previous) {
      changes.push({ kind: 'added', name: describeAfter(item).name, fields: [] });
      continue;
    }
    const was = describeBefore(previous);
    const now = describeAfter(item);
    const fields = (Object.keys(now.values) as ChangedField[])
      .filter((field) => was.values[field] !== now.values[field])
      .map((field) => ({ field, before: was.values[field] ?? '', after: now.values[field] ?? '' }));
    if (fields.length > 0) { changes.push({ kind: 'changed', name: now.name, fields }); }
  }
  return changes;
}

function describeColumn(schema: ComparableSchema) {
  return (column: Column): Described => {
    const spec = columnTypeSpec(column, schema.dictionary);
    return {
      name: column.physicalName,
      values: {
        physicalName: column.physicalName,
        logicalName: column.logicalName,
        type: spec ? formatTypeSpec(spec) : '',
        nullable: column.isNullable ? 'NULL' : 'NOT NULL',
        primaryKey: column.isPrimaryKey ? 'PK' : '',
        // Unset follows the default rule, which depends on the dialect
        autoIncrement: column.autoIncrement === undefined ? '' : column.autoIncrement ? 'AI' : '-',
        defaultValue: column.defaultValue ?? '',
        comment: column.comment,
      },
    };
  };
}

function describeRelation(schema: ComparableSchema) {
  const tableName = (id: string) => schema.tables.find((t) => t.id === id)?.physicalName ?? '?';
  const columnName = (tableId: string, columnId: string) =>
    schema.tables.find((t) => t.id === tableId)?.columns.find((c) => c.id === columnId)?.physicalName ?? '';
  return (relation: Relation): Described => ({
    name: `${tableName(relation.fromTableId)} → ${tableName(relation.toTableId)}`,
    values: {
      columns: `${columnName(relation.fromTableId, relation.fromColumnId)} → ${columnName(relation.toTableId, relation.toColumnId)}`,
      cardinality: relation.cardinality,
      foreignKey: relation.hasForeignKey ? 'FK' : '',
      name: relation.constraintName,
      comment: relation.comment,
    },
  });
}

function compareTable(before: Table, after: Table, from: ComparableSchema, to: ComparableSchema): TableChange {
  const values = (table: Table): Described['values'] => ({
    physicalName: table.physicalName,
    logicalName: table.logicalName,
    comment: table.comment,
    seedRows: String(table.seedData?.length ?? 0),
  });
  const was = values(before);
  const now = values(after);
  return {
    kind: 'changed',
    name: after.physicalName,
    fields: (Object.keys(now) as ChangedField[])
      .filter((field) => was[field] !== now[field])
      .map((field) => ({ field, before: was[field] ?? '', after: now[field] ?? '' })),
    // A column is described with the dictionary of its own side: the same entry may differ between the two
    columns: compareItems(before.columns, after.columns, describeColumn(from), describeColumn(to)),
    indexes: compareItems(
      before.indexes?.map((index) => ({ ...index, table: before })) ?? [],
      after.indexes?.map((index) => ({ ...index, table: after })) ?? [],
      (index) => ({
        name: indexName(index.table, index),
        values: {
          name: indexName(index.table, index),
          columns: index.columns.join(', '),
          unique: index.unique ? 'UNIQUE' : '',
        },
      }),
    ),
    constraints: compareItems(
      before.constraints?.map((constraint) => ({ ...constraint, table: before })) ?? [],
      after.constraints?.map((constraint) => ({ ...constraint, table: after })) ?? [],
      (constraint) => ({
        name: constraintName(constraint.table, constraint),
        values: { name: constraintName(constraint.table, constraint), expression: constraint.expression },
      }),
    ),
  };
}

const isEmptyChange = (table: TableChange) =>
  table.fields.length + table.columns.length + table.indexes.length + table.constraints.length === 0;

/** What changed going from `from` to `to`. Tables and columns are matched by id, so a rename is a change. */
export function compareSchemas(from: ComparableSchema, to: ComparableSchema): SchemaComparison {
  const beforeById = new Map(from.tables.map((t) => [t.id, t]));
  const afterIds = new Set(to.tables.map((t) => t.id));
  const wholeTable = (table: Table, kind: ChangeKind): TableChange => ({
    kind, name: table.physicalName, fields: [], columns: [], indexes: [], constraints: [],
  });
  const tables: TableChange[] = from.tables.filter((t) => !afterIds.has(t.id)).map((t) => wholeTable(t, 'removed'));
  for (const table of to.tables) {
    const before = beforeById.get(table.id);
    if (!before) {
      tables.push(wholeTable(table, 'added'));
    } else {
      const change = compareTable(before, table, from, to);
      if (!isEmptyChange(change)) { tables.push(change); }
    }
  }

  return {
    tables,
    relations: compareItems(from.relations, to.relations, describeRelation(from), describeRelation(to)),
  };
}

/** The diagram as of a saved version */
export function versionModel(model: DiagramModel, version: SchemaVersion): DiagramModel {
  return { ...model, tables: version.tables, relations: version.relations, dictionary: version.dictionary };
}

/**
 * `model` with its production schema put back to `version`. A version is a snapshot of production only, so
 * test tables and test rows stay, with the relations and dictionary entries they still need. The viewport stays too.
 */
export function restoreVersion(model: DiagramModel, version: SchemaVersion): DiagramModel {
  const testTables = model.tables.filter((t) => t.testOnly);
  const tables = [
    ...version.tables.map((t) => {
      const testSeedData = model.tables.find((current) => current.id === t.id && !current.testOnly)?.testSeedData;
      return testSeedData ? { ...t, testSeedData } : t;
    }),
    ...testTables,
  ];
  const tableIds = new Set(tables.map((t) => t.id));
  const production = productionModel(model);
  const testRelations = model.relations.filter((r) =>
    !production.relations.includes(r) && tableIds.has(r.fromTableId) && tableIds.has(r.toTableId));

  const versionEntries = new Set(version.dictionary.map((e) => e.id));
  const testEntries = new Set(testTables.flatMap((t) => t.columns.map((c) => c.dictionaryId)));
  const testIds = new Set(testTables.map((t) => t.id));
  return {
    ...model,
    tables,
    relations: [...version.relations, ...testRelations],
    dictionary: [...version.dictionary, ...model.dictionary.filter((e) => testEntries.has(e.id) && !versionEntries.has(e.id))],
    layout: {
      ...model.layout,
      tables: [...version.layout.tables, ...model.layout.tables.filter((l) => testIds.has(l.tableId))],
      regions: version.layout.regions ?? [],
    },
  };
}
