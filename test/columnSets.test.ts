import { describe, expect, it } from 'vitest';
import { Column, ColumnSet, DiagramModel } from '../shared/DiagramModel';
import { syncColumnSets } from '../webview/src/util/columnSets';
import { shopModel, tableOf } from './fixtures';

const col = (id: string, physicalName: string): Column => ({
  id, logicalName: physicalName, physicalName, dictionaryId: '', type: { dbType: 'INT', length: null },
  isPrimaryKey: false, isNullable: false, defaultValue: null, comment: '',
});

function withSet(position: ColumnSet['position'] = 'end'): DiagramModel {
  const model = shopModel();
  model.columnSets = [{ id: 'cset_audit', name: 'Audit', position, columns: [col('a1', 'created_at'), col('a2', 'updated_at')] }];
  tableOf(model, 't_users').columnSetIds = ['cset_audit'];
  return syncColumnSets(model);
}

const names = (model: DiagramModel) => tableOf(model, 't_users').columns.map((c) => c.physicalName);

describe('syncColumnSets', () => {
  it('adds set columns at the set position, only to tables using the set', () => {
    const own = names(shopModel());
    expect(names(withSet('end'))).toEqual([...own, 'created_at', 'updated_at']);
    expect(names(withSet('start'))).toEqual(['created_at', 'updated_at', ...own]);
    expect(tableOf(withSet(), 't_orders').columns.some((c) => c.columnSet)).toBe(false);
  });

  it('updates columns in place, keeping their ids', () => {
    const model = withSet();
    const before = tableOf(model, 't_users').columns.find((c) => c.physicalName === 'created_at')!;
    model.columnSets![0].columns[0] = { ...model.columnSets![0].columns[0], physicalName: 'inserted_at' };
    const after = tableOf(syncColumnSets(model), 't_users').columns.find((c) => c.id === before.id)!;
    expect(after.physicalName).toBe('inserted_at');
  });

  it('adds and removes columns as the set changes, without moving the set', () => {
    const model = withSet();
    model.columnSets![0].columns = [col('a2', 'updated_at'), col('a3', 'deleted_at')];
    expect(names(syncColumnSets(model)).slice(-2)).toEqual(['updated_at', 'deleted_at']);
  });

  it('drops the columns of a set the table no longer uses; keeps them when the set is deleted', () => {
    const unapplied = withSet();
    tableOf(unapplied, 't_users').columnSetIds = undefined;
    expect(names(syncColumnSets(unapplied))).toEqual(names(shopModel()));

    const deleted = withSet();
    deleted.columnSets = [];
    const users = tableOf(syncColumnSets(deleted), 't_users');
    expect(users.columns.map((c) => c.physicalName)).toContain('created_at');
    expect(users.columns.every((c) => !c.columnSet)).toBe(true);
  });

  it('returns the same model when nothing changes', () => {
    const model = withSet();
    expect(syncColumnSets(model)).toBe(model);
  });
});
