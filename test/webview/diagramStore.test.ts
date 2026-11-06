import { beforeEach, describe, expect, it } from 'vitest';
import { DictionaryEntry } from '../../shared/DiagramModel';
import { loadModel, useDiagramStore } from '../../webview/src/store/diagramStore';
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

  it('names an empty column after the chosen dictionary entry', () => {
    const id = addColumn();
    store().setColumnType('t_users', id, { entry });
    expect(column(id)).toMatchObject({ logicalName: 'Price', physicalName: 'Price', dictionaryId: 'd_price' });
  });

  it('names an empty column after a dictionary entry registered from the picker', () => {
    const id = addColumn();
    store().addColumnType('t_users', id, { ...entry, name: 'Registered' });
    expect(column(id)).toMatchObject({ logicalName: 'Registered', physicalName: 'Registered' });
  });

  it('never overwrites a name already entered', () => {
    const id = addColumn();
    store().updateColumn('t_users', id, { logicalName: '価格', physicalName: 'unit_price' });
    store().setColumnType('t_users', id, { entry });
    expect(column(id)).toMatchObject({ logicalName: '価格', physicalName: 'unit_price', dictionaryId: 'd_price' });
  });

  it('fills only the name left empty', () => {
    const id = addColumn();
    store().updateColumn('t_users', id, { logicalName: '価格' });
    store().setColumnType('t_users', id, { entry });
    expect(column(id)).toMatchObject({ logicalName: '価格', physicalName: 'Price' });
  });

  it('leaves names empty for a basic type', () => {
    const id = addColumn();
    store().setColumnType('t_users', id, { type: { dbType: 'INT', length: null } });
    expect(column(id)).toMatchObject({ logicalName: '', physicalName: '' });
  });
});
