import { describe, expect, it } from 'vitest';
import { DiagramModel, SchemaVersion } from '../shared/DiagramModel';
import { compareSchemas, restoreVersion, versionModel } from '../shared/schemaCompare';
import { clone, col, fk, shopModel, table, tableOf } from './fixtures';

function versionOf(model: DiagramModel): SchemaVersion {
  const { tables, relations, dictionary, layout } = clone(model);
  return { id: 'v1', name: 'v1', date: '2026-01-01T00:00:00Z', tables, relations, dictionary, layout };
}

describe('compareSchemas', () => {
  const compare = (edit: (model: DiagramModel) => void) => {
    const before = shopModel();
    const after = clone(before);
    edit(after);
    return compareSchemas(before, after);
  };

  it('finds nothing in identical schemas', () => {
    expect(compare(() => {})).toEqual({ tables: [], relations: [] });
  });

  it('reports added and removed tables', () => {
    const { tables } = compare((m) => {
      m.tables = m.tables.filter((t) => t.id !== 't_products');
      m.relations = m.relations.filter((r) => r.id !== 'item_product');
      m.tables.push(table('t_new', 'new_one', []));
    });
    expect(tables.map((t) => [t.kind, t.name])).toEqual([['removed', 'products'], ['added', 'new_one']]);
  });

  it('reports a renamed table and column as changed, not removed and added', () => {
    const { tables } = compare((m) => {
      tableOf(m, 't_users').physicalName = 'members';
      tableOf(m, 't_users').columns[1].physicalName = 'full_name';
    });
    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({ kind: 'changed', name: 'members', fields: [{ field: 'physicalName', before: 'users', after: 'members' }] });
    expect(tables[0].columns).toMatchObject([{ kind: 'changed', name: 'full_name', fields: [{ field: 'physicalName', before: 'name', after: 'full_name' }] }]);
  });

  it('reports column changes field by field', () => {
    const { tables } = compare((m) => {
      const name = tableOf(m, 't_users').columns[1];
      Object.assign(name, { dictionaryId: '', type: { dbType: 'TEXT', length: null }, isNullable: true, defaultValue: "'x'" });
    });
    expect(tables[0].columns[0].fields).toEqual([
      { field: 'type', before: 'VARCHAR(100)', after: 'TEXT' },
      { field: 'nullable', before: 'NOT NULL', after: 'NULL' },
      { field: 'defaultValue', before: '', after: "'x'" },
    ]);
  });

  it('sees a dictionary change through the column', () => {
    const { tables } = compare((m) => {
      m.dictionary = m.dictionary.map((e) => (e.id === 'd_name' ? { ...e, length: 200 } : e));
    });
    expect(tables.map((t) => t.name)).toEqual(['users', 'profiles']);
    expect(tables[0].columns[0].fields).toEqual([{ field: 'type', before: 'VARCHAR(100)', after: 'VARCHAR(200)' }]);
  });

  it('reports indexes, constraints and the number of seed rows', () => {
    const { tables } = compare((m) => {
      const items = tableOf(m, 't_items');
      items.indexes = [{ id: 'ix2', name: '', columns: ['order_id'], unique: true }];
      items.constraints = [{ id: 'c1', type: 'CHECK', name: '', expression: 'order_id > 0' }];
      items.seedData = [{ order_id: '1' }];
    });
    expect(tables[0].fields).toEqual([{ field: 'seedRows', before: '0', after: '1' }]);
    expect(tables[0].indexes.map((i) => [i.kind, i.name])).toEqual([['removed', 'ix_items_product'], ['added', 'ux_order_items_order_id']]);
    expect(tables[0].constraints.map((c) => [c.kind, c.name])).toEqual([['added', 'ck_order_items_1']]);
  });

  it('reports relations', () => {
    const { relations } = compare((m) => {
      m.relations[0].hasForeignKey = false;
      m.relations.splice(1, 1);
    });
    expect(relations.map((r) => [r.kind, r.name])).toEqual([['removed', 'users → orders'], ['changed', 'users → profiles']]);
    expect(relations[1].fields).toEqual([{ field: 'foreignKey', before: 'FK', after: '' }]);
  });

  it('compares a version with another version', () => {
    const model = shopModel();
    const first = versionOf(model);
    const second = { ...versionOf(model), id: 'v2', tables: first.tables.slice(0, 2), relations: [] };
    const { tables } = compareSchemas(versionModel(model, first), versionModel(model, second));
    expect(tables.map((t) => t.kind)).toEqual(['removed', 'removed', 'removed']);
  });
});

describe('restoreVersion', () => {
  it('gives back the tables, relations, dictionary and layout of the version', () => {
    const model = shopModel();
    model.layout.tables = [{ tableId: 't_users', x: 1, y: 2, width: 240 }];
    const version = versionOf(model);
    const edited = clone(model);
    edited.tables = edited.tables.slice(0, 1);
    edited.relations = [];
    edited.dictionary = [];
    edited.layout.tables[0].x = 500;

    const restored = restoreVersion(edited, version);
    expect(restored.tables).toEqual(model.tables);
    expect(restored.relations).toEqual(model.relations);
    expect(restored.dictionary).toEqual(model.dictionary);
    expect(restored.layout.tables).toEqual(model.layout.tables);
  });

  it('keeps what a version does not hold', () => {
    const model = shopModel();
    const version = versionOf(model);
    const edited = clone(model);
    edited.layout.viewport = { x: 9, y: 9, zoom: 2 };
    edited.schemaVersions = [version];
    edited.database = { name: 'shop', options: {} };

    const restored = restoreVersion(edited, version);
    expect(restored.layout.viewport).toEqual({ x: 9, y: 9, zoom: 2 });
    expect(restored.schemaVersions).toEqual([version]);
    expect(restored.database?.name).toBe('shop');
  });

  it('keeps test tables, test rows, and what they need', () => {
    const model = shopModel();
    const version = versionOf(model);
    const edited = clone(model);
    edited.dictionary.push({ id: 'd_test', name: 'Test', dbType: 'INT', length: null, notNull: true, comment: '' });
    edited.tables.push(table('t_fake', 'fake', [col('f_user', 'user_id', 'd_test')], { testOnly: true }));
    edited.relations.push(fk('fake_user', ['t_users', 'u_id'], ['t_fake', 'f_user']));
    edited.layout.tables.push({ tableId: 't_fake', x: 1, y: 1, width: 240 });
    tableOf(edited, 't_users').testSeedData = [{ id: '9' }];

    const restored = restoreVersion(edited, version);
    expect(tableOf(restored, 't_fake').testOnly).toBe(true);
    expect(tableOf(restored, 't_users').testSeedData).toEqual([{ id: '9' }]);
    expect(restored.relations.map((r) => r.id)).toContain('fake_user');
    expect(restored.dictionary.map((e) => e.id)).toContain('d_test');
    expect(restored.layout.tables.map((l) => l.tableId)).toEqual(['t_fake']);
  });

  it('drops a test relation to a table the version does not have', () => {
    const model = shopModel();
    const version = versionOf(model);
    const edited = clone(model);
    edited.tables.push(
      table('t_later', 'later', [col('l_id', 'id', 'd_id')]),
      table('t_fake', 'fake', [col('f_id', 'id', 'd_id')], { testOnly: true }),
    );
    edited.relations.push(fk('fake_later', ['t_later', 'l_id'], ['t_fake', 'f_id']));
    expect(restoreVersion(edited, version).relations.map((r) => r.id)).not.toContain('fake_later');
  });
});
