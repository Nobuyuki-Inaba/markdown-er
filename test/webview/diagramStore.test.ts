import { beforeEach, describe, expect, it } from 'vitest';
import { DictionaryEntry } from '../../shared/DiagramModel';
import { applyHistory, loadModel, useDiagramStore } from '../../webview/src/store/diagramStore';
import { buildSqlImport } from '../../webview/src/util/sqlImport/buildSqlImport';
import { shopModel, tableOf } from '../fixtures';

const entry: DictionaryEntry = { id: 'd_price', name: 'Price', dbType: 'INT', length: null, notNull: true, comment: '' };

const store = () => useDiagramStore.getState();
const columns = () => tableOf(store().model, 't_users').columns;

/** Adds a column and returns its id */
function addColumn(): string {
  store().addColumn('t_users');
  return columns().find((c) => !c.logicalName && !c.physicalName)!.id;
}
const column = (id: string) => columns().find((c) => c.id === id)!;

describe('column names', () => {
  beforeEach(() => loadModel(shopModel()));

  it('starts a new column without names', () => {
    const c = column(addColumn());
    expect([c.logicalName, c.physicalName]).toEqual(['', '']);
  });

  it('starts a new column without a type', () => {
    const c = column(addColumn());
    expect(c.dictionaryId).toBe('');
    expect(c.type).toBeUndefined();
  });

  it('sets only the logical name from the chosen dictionary entry', () => {
    const id = addColumn();
    store().setColumnType('t_users', id, { entry });
    expect(column(id)).toMatchObject({ logicalName: 'Price', physicalName: '', dictionaryId: 'd_price' });
  });

  it('sets the logical name from a dictionary entry registered in the picker', () => {
    const id = addColumn();
    store().addColumnType('t_users', id, { ...entry, name: 'Registered' });
    expect(column(id)).toMatchObject({ logicalName: 'Registered', physicalName: '' });
  });

  it('never overwrites a name already entered', () => {
    const id = addColumn();
    store().updateColumn('t_users', id, { logicalName: '価格', physicalName: 'unit_price' });
    store().setColumnType('t_users', id, { entry });
    expect(column(id)).toMatchObject({ logicalName: '価格', physicalName: 'unit_price', dictionaryId: 'd_price' });
  });

  it('leaves names empty for a basic type', () => {
    const id = addColumn();
    store().setColumnType('t_users', id, { type: { dbType: 'INT', length: null } });
    expect(column(id)).toMatchObject({ logicalName: '', physicalName: '' });
  });
});

describe('importSql', () => {
  beforeEach(() => loadModel(shopModel()));

  const importing = (sql: string, replaceSeedData = false) =>
    store().importSql(buildSqlImport(sql, store().model, 'mysql'), replaceSeedData);
  const seed = (id: string) => tableOf(store().model, id).seedData;

  it('adds tables, their layout and relations as one undo step', () => {
    const before = store().model.tables.length;
    importing('CREATE TABLE tags (id INT PRIMARY KEY, user_id INT REFERENCES users (id));');
    const added = store().model.tables[before];
    expect(added.physicalName).toBe('tags');
    expect(store().model.layout.tables.some((l) => l.tableId === added.id)).toBe(true);
    expect(store().model.relations.some((r) => r.toTableId === added.id)).toBe(true);
    applyHistory('undo');
    expect(store().model.tables).toHaveLength(before);
  });

  it('adds rows to an existing table, or replaces them', () => {
    importing("INSERT INTO users (id) VALUES (1);");
    importing("INSERT INTO users (id) VALUES (2);");
    expect(seed('t_users')?.map((r) => r.id)).toEqual(['1', '2']);
    importing("INSERT INTO users (id) VALUES (3);", true);
    expect(seed('t_users')?.map((r) => r.id)).toEqual(['3']);
  });
});
