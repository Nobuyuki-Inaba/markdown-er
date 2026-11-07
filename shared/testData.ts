import type { DiagramModel, Relation, Table, TableLayout } from './DiagramModel';

/**
 * Test-only tables and test rows live in one model with everything else, so the diagram and the editors
 * need no second source. They are split off here: for the test file, and for everything that must
 * see the production schema only (the .ermd file, production DDL, schema diffs, versions).
 */

/** The contents of `<file>.ermd.test.yaml` */
export interface TestFileData {
  tables?: Table[];
  /** Relations touching a test-only table */
  relations?: Relation[];
  layout?: TableLayout[];
  /** Test rows of production tables, by table id */
  seedData?: Record<string, Record<string, string>[]>;
}

function testTableIds(tables: Table[]): Set<string> {
  return new Set(tables.filter((t) => t.testOnly).map((t) => t.id));
}

/** A relation belongs to the test side when either of its tables does */
export function isTestRelation(relation: Relation, tables: Table[]): boolean {
  const ids = testTableIds(tables);
  return ids.has(relation.fromTableId) || ids.has(relation.toTableId);
}

function hasTestData(model: DiagramModel): boolean {
  return model.tables.some((t) => t.testOnly || t.testSeedData?.length);
}

/** Without test tables and test rows. The same object when there are none, so such a model stays as it is. */
export function productionModel(model: DiagramModel): DiagramModel {
  if (!hasTestData(model)) { return model; }
  const ids = testTableIds(model.tables);
  return {
    ...model,
    tables: model.tables.filter((t) => !t.testOnly).map(({ testSeedData: _rows, ...table }) => table),
    relations: model.relations.filter((r) => !ids.has(r.fromTableId) && !ids.has(r.toTableId)),
    layout: { ...model.layout, tables: model.layout.tables.filter((l) => !ids.has(l.tableId)) },
  };
}

/** All tables, each with only its test rows as `seedData`: what test INSERTs are generated from */
export function testModel(model: DiagramModel): DiagramModel {
  return {
    ...model,
    tables: model.tables.map((t) => (t.testOnly ? t : { ...t, seedData: t.testSeedData })),
  };
}

/** What goes in the test file; null when there is nothing */
export function testFileData(model: DiagramModel): TestFileData | null {
  if (!hasTestData(model)) { return null; }
  const ids = testTableIds(model.tables);
  const tables = model.tables.filter((t) => t.testOnly).map(({ testOnly: _flag, testSeedData: _rows, ...table }) => table);
  const relations = model.relations.filter((r) => ids.has(r.fromTableId) || ids.has(r.toTableId));
  const layout = model.layout.tables.filter((l) => ids.has(l.tableId));
  const seedData = Object.fromEntries(
    model.tables.filter((t) => !t.testOnly && t.testSeedData?.length).map((t) => [t.id, t.testSeedData!]),
  );
  return {
    ...(tables.length > 0 ? { tables } : {}),
    ...(relations.length > 0 ? { relations } : {}),
    ...(layout.length > 0 ? { layout } : {}),
    ...(Object.keys(seedData).length > 0 ? { seedData } : {}),
  };
}

/** The reverse of `testFileData()`. Rows of a table that no longer exists are dropped. */
export function mergeTestFileData(model: DiagramModel, data: TestFileData): DiagramModel {
  const known = new Set(model.tables.map((t) => t.id));
  return {
    ...model,
    tables: [
      ...model.tables.map((t) => (data.seedData?.[t.id] ? { ...t, testSeedData: data.seedData[t.id] } : t)),
      ...(data.tables ?? []).filter((t) => !known.has(t.id)).map((t) => ({ ...t, testOnly: true })),
    ],
    relations: [...model.relations, ...(data.relations ?? [])],
    layout: { ...model.layout, tables: [...model.layout.tables, ...(data.layout ?? [])] },
  };
}
