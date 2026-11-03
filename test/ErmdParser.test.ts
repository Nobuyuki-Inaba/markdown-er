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
