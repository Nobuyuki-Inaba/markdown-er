import { describe, expect, it } from 'vitest';
import { TableIndex, indexName } from '../../shared/DiagramModel';
import { DdlExporter, SchemaDiffer } from '../../src/ddl';
import { clone, shopModel, tableOf } from '../fixtures';

const unnamed: TableIndex = { id: 'ix2', name: '', columns: ['user_id', 'total'], unique: false };

function withUnnamedIndex() {
  const model = shopModel();
  tableOf(model, 't_orders').indexes = [unnamed];
  return model;
}

describe('indexName', () => {
  const orders = { physicalName: 'orders' };

  it('uses the name given', () => {
    expect(indexName(orders, { ...unnamed, name: 'my_index' })).toBe('my_index');
  });

  it('builds one from the table and columns', () => {
    expect(indexName(orders, unnamed)).toBe('ix_orders_user_id_total');
    expect(indexName(orders, { ...unnamed, unique: true })).toBe('ux_orders_user_id_total');
  });

  it('keeps long names short and apart', () => {
    const columns = Array.from({ length: 20 }, (_, i) => `column_${i}`);
    const a = indexName(orders, { ...unnamed, columns });
    const b = indexName(orders, { ...unnamed, columns: [...columns.slice(0, 19), 'other'] });
    expect(a).toHaveLength(63);
    expect(a).not.toBe(b);
  });
});

describe('an index without a name', () => {
  it('is generated', () => {
    expect(DdlExporter.export(withUnnamedIndex(), 'postgresql'))
      .toContain('CREATE INDEX "ix_orders_user_id_total" ON "orders" ("user_id", "total");');
  });

  it('is left out without columns', () => {
    const model = shopModel();
    tableOf(model, 't_orders').indexes = [{ ...unnamed, columns: [] }];
    expect(DdlExporter.export(model, 'postgresql')).not.toContain('ix_orders');
  });

  it('is replaced under its new name when the table is renamed', () => {
    const before = withUnnamedIndex();
    const after = clone(before);
    tableOf(after, 't_orders').physicalName = 'purchases';
    const diff = SchemaDiffer.diff(before, after, 'mysql');
    expect(diff).toContain('DROP INDEX `ix_orders_user_id_total`');
    expect(diff).toContain('CREATE INDEX `ix_purchases_user_id_total`');
  });

  it('is not touched by an unrelated change', () => {
    const before = withUnnamedIndex();
    const after = clone(before);
    tableOf(after, 't_users').comment = 'changed';
    expect(SchemaDiffer.diff(before, after, 'mysql')).not.toContain('INDEX');
  });
});
