import { describe, expect, it } from 'vitest';
import { TableConstraint, TableIndex, constraintName, indexName } from '../../shared/DiagramModel';
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

describe('a constraint without a name', () => {
  const unique: TableConstraint = { id: 'c1', type: 'UNIQUE', name: '', expression: 'user_id, total' };
  const check: TableConstraint = { id: 'c2', type: 'CHECK', name: '', expression: 'total >= 0' };
  const secondCheck: TableConstraint = { id: 'c3', type: 'CHECK', name: '', expression: 'total < 100' };

  function withConstraints(constraints: TableConstraint[] = [unique, check, secondCheck]) {
    const model = shopModel();
    tableOf(model, 't_orders').constraints = constraints;
    return model;
  }

  it('gets a name from the table', () => {
    const orders = { physicalName: 'orders', constraints: [unique, check, secondCheck] };
    expect(constraintName(orders, unique)).toBe('uq_orders_user_id_total');
    expect(constraintName(orders, check)).toBe('ck_orders_1');
    expect(constraintName(orders, secondCheck)).toBe('ck_orders_2');
    expect(constraintName(orders, { ...check, name: 'mine' })).toBe('mine');
  });

  it('is generated, not dropped', () => {
    const ddl = DdlExporter.export(withConstraints(), 'postgresql');
    expect(ddl).toContain('CONSTRAINT "uq_orders_user_id_total" UNIQUE ("user_id", "total")');
    expect(ddl).toContain('CONSTRAINT "ck_orders_1" CHECK (total >= 0)');
    expect(ddl).toContain('CONSTRAINT "ck_orders_2" CHECK (total < 100)');
  });

  it('is left out when it has no expression', () => {
    const ddl = DdlExporter.export(withConstraints([{ ...unique, expression: '' }]), 'postgresql');
    expect(ddl).not.toContain('CONSTRAINT "uq_');
  });

  it('never gives a CUSTOM constraint a name', () => {
    const custom: TableConstraint = { id: 'c4', type: 'CUSTOM', name: '', expression: 'GRANT SELECT ON orders TO app' };
    expect(DdlExporter.export(withConstraints([custom]), 'postgresql')).toContain('GRANT SELECT ON orders TO app;');
  });

  it('is replaced under its new name when the table is renamed', () => {
    const before = withConstraints();
    const after = clone(before);
    tableOf(after, 't_orders').physicalName = 'purchases';
    const diff = SchemaDiffer.diff(before, after, 'postgresql');
    expect(diff).toContain('DROP CONSTRAINT "ck_orders_1"');
    expect(diff).toContain('ADD CONSTRAINT "ck_purchases_1"');
  });

  it('is not touched by an unrelated change', () => {
    const before = withConstraints();
    const after = clone(before);
    tableOf(after, 't_users').comment = 'changed';
    expect(SchemaDiffer.diff(before, after, 'postgresql')).not.toContain('CONSTRAINT');
  });
});
