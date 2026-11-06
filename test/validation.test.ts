import { describe, expect, it } from 'vitest';
import { validateModel } from '../shared/validation';
import { shopModel, tableOf } from './fixtures';

describe('validateModel', () => {
  it('accepts a complete model', () => {
    expect(validateModel(shopModel())).toEqual([]);
  });

  it('reports a table without a physical name, labelled by its logical name', () => {
    const model = shopModel();
    Object.assign(tableOf(model, 't_users'), { logicalName: 'Users', physicalName: ' ' });
    expect(validateModel(model)).toEqual([{ code: 'tableNameMissing', table: 'Users' }]);
  });

  it('reports a column without a physical name', () => {
    const model = shopModel();
    const table = tableOf(model, 't_users');
    Object.assign(table.columns[0], { logicalName: 'Price', physicalName: '' });
    expect(validateModel(model)).toEqual([{ code: 'columnNameMissing', table: table.physicalName, column: 'Price' }]);
  });

  it('labels a column without any name by its position', () => {
    const model = shopModel();
    const table = tableOf(model, 't_users');
    Object.assign(table.columns[1], { logicalName: '', physicalName: '' });
    expect(validateModel(model)).toEqual([{ code: 'columnNameMissing', table: table.physicalName, column: '#2' }]);
  });
});
