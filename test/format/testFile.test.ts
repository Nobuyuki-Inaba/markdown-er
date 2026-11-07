import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DiagramModel } from '../../shared/DiagramModel';
import { productionModel } from '../../shared/testData';
import { decode, encode, testFileName } from '../../src/format/ErmdCodec';
import { clone, col, fk, shopModel, table, tableOf } from '../fixtures';

const OPTIONS = { fileName: 'shop.ermd' };

/** shopModel with a test-only table related to `users`, and test rows on `users` */
function withTestData(): DiagramModel {
  const model = shopModel();
  model.tables.push(table('t_fake', 'fake_mails', [
    col('f_id', 'id', 'd_id', { isPrimaryKey: true }),
    col('f_user', 'user_id', 'd_id'),
  ], { testOnly: true, seedData: [{ id: '1', user_id: '1' }] }));
  model.relations.push(fk('fake_user', ['t_users', 'u_id'], ['t_fake', 'f_user']));
  model.layout.tables.push({ tableId: 't_users', x: 1, y: 2, width: 240 }, { tableId: 't_fake', x: 3, y: 4, width: 240 });
  tableOf(model, 't_users').testSeedData = [{ id: '9', name: 'tester', active: 'true' }];
  return model;
}

describe('test file', () => {
  it('is named after the diagram', () => {
    expect(testFileName('shop.ermd')).toBe('shop.ermd.test.yaml');
  });

  it('keeps test tables, their relations and test rows out of the .ermd file', () => {
    const { main, test } = encode(withTestData(), { main: undefined, versions: undefined }, OPTIONS);
    expect(main).not.toContain('fake_mails');
    expect(main).not.toContain('tester');
    expect(main).not.toContain('t_fake');
    expect(main).not.toContain('testOnly');
    expect(test).toContain('fake_mails');
    expect(test).toContain('tester');
  });

  it('gives back the same model', () => {
    const model = withTestData();
    const { main, versions, test } = encode(model, { main: undefined, versions: undefined }, OPTIONS);
    const decoded = decode({ main, versions: versions ?? undefined, test: test ?? undefined });
    const ids = (m: DiagramModel) => m.tables.map((t) => [t.id, !!t.testOnly]);
    expect(ids(decoded)).toEqual(ids(model));
    expect(tableOf(decoded, 't_users').testSeedData).toEqual(tableOf(model, 't_users').testSeedData);
    expect(tableOf(decoded, 't_fake').seedData).toEqual([{ id: '1', user_id: '1' }]);
    expect(decoded.relations.map((r) => r.id).sort()).toEqual(model.relations.map((r) => r.id).sort());
    expect(decoded.layout.tables).toEqual(model.layout.tables);
  });

  it('writes nothing about tests for a diagram without test data', () => {
    const model = shopModel();
    const plain = encode(model, { main: undefined, versions: undefined }, OPTIONS);
    expect(plain.test).toBeNull();
    expect(plain.main).not.toContain('test');
  });

  it('does not change the .ermd file when only test data changes', () => {
    const first = encode(productionModel(withTestData()), { main: undefined, versions: undefined }, OPTIONS);
    const second = encode(withTestData(), { main: first.main, versions: undefined }, OPTIONS);
    expect(second.main).toBe(first.main);
  });

  it('keeps the bytes of a real file through a save', () => {
    const main = readFileSync(join(__dirname, '../fixtures/v2/full.ermd'), 'utf-8');
    const texts = { main, versions: readFileSync(join(__dirname, '../fixtures/v2/full.ermd.versions.yaml'), 'utf-8') };
    expect(encode(decode(texts), texts, { fileName: 'full.ermd' }).main).toBe(main);
  });

  it('asks to delete the file when the last test data goes', () => {
    const original = encode(withTestData(), { main: undefined, versions: undefined }, OPTIONS);
    const out = encode(shopModel(), { main: original.main, versions: undefined, test: original.test! }, OPTIONS);
    expect(out.test).toBeNull();
  });

  it('never touches a file it cannot read', () => {
    const texts = { main: undefined, versions: undefined, test: 'tables: [' };
    expect(encode(withTestData(), texts, OPTIONS).test).toBeUndefined();
    expect(decode(texts).tables).toEqual([]);
    expect(encode(shopModel(), { ...texts, test: '- a list' }, OPTIONS).test).toBeUndefined();
  });

  it('drops the test rows of a table that no longer exists', () => {
    const test = encode(withTestData(), { main: undefined, versions: undefined }, OPTIONS).test!;
    const model = decode({ main: undefined, versions: undefined, test });
    expect(model.tables.map((t) => t.id)).toEqual(['t_fake']);
  });
});

describe('productionModel', () => {
  it('is the same object without test data', () => {
    const model = shopModel();
    expect(productionModel(model)).toBe(model);
  });

  it('removes test tables, their relations and layout, and test rows', () => {
    const model = clone(withTestData());
    const production = productionModel(model);
    expect(production.tables.some((t) => t.testOnly)).toBe(false);
    expect(production.relations.some((r) => r.id === 'fake_user')).toBe(false);
    expect(production.layout.tables.map((l) => l.tableId)).toEqual(['t_users']);
    expect(tableOf(production, 't_users').testSeedData).toBeUndefined();
  });
});
