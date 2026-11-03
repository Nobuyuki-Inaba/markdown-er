import { Column, DiagramModel, DictionaryEntry, Relation, Table, createEmptyModel } from '../shared/DiagramModel';

export const dict: DictionaryEntry[] = [
  { id: 'd_id',    name: 'ID',     dbType: 'INT',     length: null, notNull: true,  comment: '' },
  { id: 'd_name',  name: 'Name',   dbType: 'VARCHAR', length: 100,  notNull: true,  comment: '' },
  { id: 'd_money', name: 'Amount', dbType: 'DECIMAL', length: 10, scale: 2, notNull: true, comment: '' },
  { id: 'd_flag',  name: 'Flag',   dbType: 'BOOLEAN', length: null, notNull: true,  comment: '' },
];

export function col(id: string, physicalName: string, dictionaryId: string, extra: Partial<Column> = {}): Column {
  return {
    id, physicalName, dictionaryId,
    logicalName: physicalName,
    isPrimaryKey: false, isNullable: false, defaultValue: null, comment: '',
    ...extra,
  };
}

export function table(id: string, physicalName: string, columns: Column[], extra: Partial<Table> = {}): Table {
  return { id, physicalName, logicalName: physicalName, comment: '', columns, ...extra };
}

export function fk(id: string, from: [string, string], to: [string, string], extra: Partial<Relation> = {}): Relation {
  return {
    id,
    fromTableId: from[0], fromColumnId: from[1],
    toTableId: to[0], toColumnId: to[1],
    cardinality: 'ONE_TO_MANY', hasForeignKey: true, constraintName: `fk_${id}`, comment: '',
    ...extra,
  };
}

/**
 * users 1─N orders 1─N order_items (composite PK) N─1 products
 * users 1─1 profiles (PK is also the FK)
 */
export function shopModel(): DiagramModel {
  return {
    ...createEmptyModel(),
    dictionary: dict,
    tables: [
      table('t_users', 'users', [
        col('u_id', 'id', 'd_id', { isPrimaryKey: true }),
        col('u_name', 'name', 'd_name', { logicalName: 'ユーザー名', comment: "display name, can't be empty" }),
        col('u_active', 'active', 'd_flag', { defaultValue: 'TRUE' }),
      ], { logicalName: 'ユーザー' }),
      table('t_profiles', 'profiles', [
        col('p_user', 'user_id', 'd_id', { isPrimaryKey: true }),
        col('p_bio', 'bio', 'd_name', { isNullable: true }),
      ]),
      table('t_orders', 'orders', [
        col('o_id', 'id', 'd_id', { isPrimaryKey: true }),
        col('o_user', 'user_id', 'd_id'),
        col('o_total', 'total', 'd_money'),
      ]),
      table('t_items', 'order_items', [
        col('i_order', 'order_id', 'd_id', { isPrimaryKey: true }),
        col('i_product', 'product_id', 'd_id', { isPrimaryKey: true }),
      ], { indexes: [{ id: 'ix1', name: 'ix_items_product', columns: ['product_id'], unique: false }] }),
      table('t_products', 'products', [
        col('pr_id', 'id', 'd_id', { isPrimaryKey: true }),
      ]),
    ],
    relations: [
      fk('profile_user', ['t_users', 'u_id'], ['t_profiles', 'p_user'], { cardinality: 'ONE_TO_ONE' }),
      fk('order_user', ['t_users', 'u_id'], ['t_orders', 'o_user']),
      fk('item_order', ['t_orders', 'o_id'], ['t_items', 'i_order']),
      fk('item_product', ['t_products', 'pr_id'], ['t_items', 'i_product'], { constraintName: '' }),
    ],
  };
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function tableOf(model: DiagramModel, id: string): Table {
  return model.tables.find((t) => t.id === id)!;
}

/** shopModel with every optional section filled: database, column sets, seed data, regions, schema versions */
export function fullModel(): DiagramModel {
  const model = shopModel();
  model.database = { name: 'shop', schema: 'app', user: 'app_user', options: { mysql: { charset: 'utf8mb4' } } };
  model.columnSets = [{ id: 'cset_audit', name: 'Audit', position: 'end', columns: [col('cs_created', 'created_at', 'd_name')] }];
  model.tables[0].columnSetIds = ['cset_audit'];
  model.tables[0].columns.push(col('u_created', 'created_at', 'd_name', { columnSet: { setId: 'cset_audit', columnId: 'cs_created' } }));
  model.tables[0].seedData = [{ id: '1', name: 'Alice', active: 'TRUE', created_at: '2026-01-01' }];
  model.layout = {
    nameMode: 'physical',
    tables: model.tables.map((t, i) => ({ tableId: t.id, x: 60 + i * 300, y: 60, width: 260 })),
    regions: [{ id: 'r1', label: 'Sales', x: 0, y: 0, width: 800, height: 400 }],
    viewport: { x: 10, y: 20, zoom: 0.8 },
  };
  model.schemaVersions = [
    { id: 'ver_1', name: 'v1', date: '2026-01-01T00:00:00.000Z', tables: clone(model.tables.slice(0, 2)), relations: [], dictionary: clone(model.dictionary), layout: clone(model.layout) },
    { id: 'ver_2', name: 'v2', date: '2026-02-01T00:00:00.000Z', tables: clone(model.tables), relations: clone(model.relations), dictionary: clone(model.dictionary), layout: clone(model.layout) },
  ];
  return model;
}
