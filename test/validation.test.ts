import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { validateModel } from '../shared/validation';
import { ErmdParser } from '../src/ErmdParser';
import { shopModel, tableOf } from './fixtures';

describe('validateModel', () => {
  it('accepts a complete model', () => {
    expect(validateModel(shopModel())).toEqual([]);
  });

  it('accepts the sample diagram', () => {
    const text = readFileSync(join(__dirname, '../examples/sample.ermd'), 'utf-8');
    expect(validateModel(ErmdParser.parse(text))).toEqual([]);
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

  it('reports a column without a type, but not one with a direct type', () => {
    const model = shopModel();
    const table = tableOf(model, 't_users');
    Object.assign(table.columns[1], { dictionaryId: '', type: undefined });
    Object.assign(table.columns[2], { dictionaryId: '', type: { dbType: 'INT', length: null } });
    expect(validateModel(model)).toEqual([{ code: 'columnTypeMissing', table: 'users', column: table.columns[1].physicalName }]);
  });

  it('reports a column whose dictionary entry no longer exists', () => {
    const model = shopModel();
    const column = tableOf(model, 't_users').columns[1];
    column.dictionaryId = 'd_gone';
    expect(validateModel(model)).toEqual([{ code: 'columnTypeMissing', table: 'users', column: column.physicalName }]);
  });

  it('reports duplicate table names, ignoring case, once per name', () => {
    const model = shopModel();
    tableOf(model, 't_orders').physicalName = 'Users';
    expect(validateModel(model)).toEqual([{ code: 'tableNameDuplicate', table: 'users' }]);
  });

  it('reports duplicate column names within a table only', () => {
    const model = shopModel();
    const [first, second] = tableOf(model, 't_users').columns;
    second.physicalName = first.physicalName.toUpperCase();
    expect(validateModel(model)).toEqual([{ code: 'columnNameDuplicate', table: 'users', column: first.physicalName }]);
    expect(validateModel(shopModel())).toEqual([]);
  });

  it('does not report empty names as duplicates', () => {
    const model = shopModel();
    const [, second, third] = tableOf(model, 't_users').columns;
    second.physicalName = '';
    third.physicalName = '';
    expect(validateModel(model).map((e) => e.code)).toEqual(['columnNameMissing', 'columnNameMissing']);
  });

  it('reports a relation with an FK constraint whose column is missing', () => {
    const model = shopModel();
    model.relations[0].toColumnId = '';
    expect(validateModel(model)).toEqual([{ code: 'relationColumnMissing', table: 'users → profiles' }]);
  });

  it('accepts a logical relation: no FK constraint, no columns', () => {
    const model = shopModel();
    Object.assign(model.relations[0], { hasForeignKey: false, fromColumnId: '', toColumnId: '' });
    expect(validateModel(model)).toEqual([]);
  });
});
