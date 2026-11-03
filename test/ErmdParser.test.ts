import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ErmdParser } from '../src/ErmdParser';
import { ErmdSerializer } from '../src/ErmdSerializer';
import { shopModel } from './fixtures';

const uri = { path: '/work/shop.ermd' } as Parameters<typeof ErmdSerializer.serialize>[1];

describe('ErmdParser / ErmdSerializer', () => {
  it('round-trips a model', () => {
    const model = shopModel();
    const parsed = ErmdParser.parse(ErmdSerializer.serialize(model, uri));
    expect(parsed.tables).toEqual(model.tables);
    expect(parsed.relations).toEqual(model.relations);
    expect(parsed.dictionary).toEqual(model.dictionary);
  });

  it('round-trips the auto-increment setting, and leaves it out when unset', () => {
    const model = shopModel();
    model.tables[0].columns[0].autoIncrement = false;
    const text = ErmdSerializer.serialize(model, uri);
    expect(text.match(/autoIncrement/g)).toHaveLength(1);
    expect(ErmdParser.parse(text).tables).toEqual(model.tables);
  });

  it('round-trips column sets and database settings', () => {
    const model = shopModel();
    model.database = { name: 'shop', schema: 'app', user: 'app_user', options: { mysql: { charset: 'utf8mb4' } } };
    model.columnSets = [{ id: 'cset_a', name: 'Audit', position: 'end', applyToNewTables: true, columns: [model.tables[0].columns[0]] }];
    model.tables[0].columnSetIds = ['cset_a'];
    model.tables[0].columns[0] = { ...model.tables[0].columns[0], columnSet: { setId: 'cset_a', columnId: 'x' } };
    const parsed = ErmdParser.parse(ErmdSerializer.serialize(model, uri));
    expect(parsed.database).toEqual(model.database);
    expect(parsed.columnSets).toEqual(model.columnSets);
    expect(parsed.tables).toEqual(model.tables);
  });

  it('parses the bundled sample', () => {
    const model = ErmdParser.parse(readFileSync(join(__dirname, '../examples/sample.ermd'), 'utf-8'));
    expect(model.tables.length).toBeGreaterThan(0);
    expect(model.relations.length).toBeGreaterThan(0);
  });

  it('returns an empty model for files without er-diagram front matter', () => {
    expect(ErmdParser.parse('# just markdown\n').tables).toEqual([]);
  });

  it('fills in fields missing from hand-written blocks', () => {
    const text = [
      '---', 'er-diagram: true', '---',
      '```ermd-dictionary', '- id: d1', '  name: Money', '  dbType: DECIMAL', '  length: 10', '  scale: 2', '```',
      '```ermd-table', 'id: t1', 'physicalName: t', 'columns:', '  - id: c1', '    physicalName: c', '```',
    ].join('\n');
    const model = ErmdParser.parse(text);
    expect(model.dictionary[0]).toMatchObject({ length: 10, scale: 2, notNull: false, comment: '' });
    expect(model.tables[0].columns[0]).toEqual({
      id: 'c1', physicalName: 'c', logicalName: '', dictionaryId: '',
      isPrimaryKey: false, isNullable: true, defaultValue: null, comment: '',
    });
  });
});
