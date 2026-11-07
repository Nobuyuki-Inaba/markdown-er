import { describe, expect, it } from 'vitest';
import { DdlDialect, DiagramModel } from '../../shared/DiagramModel';
import { validateModel } from '../../shared/validation';
import { DdlExporter, SchemaDiffer } from '../../src/ddl';
import { clone, col, fk, shopModel, table, tableOf } from '../fixtures';

function withTestData(): DiagramModel {
  const model = shopModel();
  model.tables.push(table('t_fake', 'fake_mails', [
    col('f_id', 'id', 'd_id', { isPrimaryKey: true }),
    col('f_user', 'user_id', 'd_id'),
  ], { testOnly: true, seedData: [{ id: '1', user_id: '9' }], indexes: [{ id: 'ix', name: 'ix_fake', columns: ['user_id'], unique: false }] }));
  model.relations.push(fk('fake_user', ['t_users', 'u_id'], ['t_fake', 'f_user']));
  tableOf(model, 't_users').testSeedData = [{ id: '9', name: 'tester', active: 'true' }];
  tableOf(model, 't_users').seedData = [{ id: '1', name: 'real', active: 'true' }];
  return model;
}

const dialects: DdlDialect[] = ['mysql', 'postgresql', 'oracle', 'sqlserver', 'sqlite'];

describe.each(dialects)('test DDL: %s', (dialect) => {
  it('leaves test data out of the production DDL and data', () => {
    const model = withTestData();
    const plain = withTestData();
    plain.tables = plain.tables.filter((t) => !t.testOnly);
    plain.relations = plain.relations.filter((r) => r.id !== 'fake_user');
    delete tableOf(plain, 't_users').testSeedData;
    const options = { insertSeedData: true };
    expect(DdlExporter.export(model, dialect, options)).toBe(DdlExporter.export(plain, dialect, options));
    expect(DdlExporter.exportData(model, dialect)).not.toContain('tester');
  });

  it('creates only the test tables, and inserts only test rows', () => {
    const ddl = DdlExporter.exportTest(withTestData(), dialect, { insertSeedData: true });
    expect(ddl).toContain('fake_mails');
    expect(ddl).toContain('ix_fake');
    expect(ddl).toContain('tester');
    expect(ddl).not.toContain('real');
    expect(ddl).not.toMatch(/CREATE TABLE \S*orders/);
    expect(ddl).not.toMatch(/CREATE TABLE \S*"?users/);
  });

  it('writes test rows of production tables before the rows that refer to them', () => {
    const data = DdlExporter.exportTestData(withTestData(), dialect);
    expect(data.indexOf('tester')).toBeGreaterThanOrEqual(0);
    expect(data.indexOf('tester')).toBeLessThan(data.indexOf('fake_mails'));
  });

  it('never creates a database', () => {
    const model = withTestData();
    model.database = { name: 'shop', options: {} };
    const ddl = DdlExporter.exportTest(model, dialect, { includeCreateDatabase: true });
    expect(ddl).not.toContain('CREATE DATABASE');
  });

  it('is empty without test data', () => {
    expect(DdlExporter.exportTest(shopModel(), dialect)).toBe('');
    expect(DdlExporter.exportTestData(shopModel(), dialect)).toBe('');
  });

  it('leaves test tables out of schema diffs', () => {
    expect(SchemaDiffer.diff(shopModel(), withTestData(), dialect)).toBe(SchemaDiffer.diff(shopModel(), shopModel(), dialect));
  });
});

describe('test DDL foreign keys', () => {
  it('adds a production table\'s FK to a test parent with ALTER TABLE', () => {
    const model = withTestData();
    model.relations.push(fk('order_fake', ['t_fake', 'f_id'], ['t_orders', 'o_id']));
    const ddl = DdlExporter.exportTest(model, 'postgresql');
    expect(ddl).toMatch(/ALTER TABLE "orders"\s+ADD CONSTRAINT "fk_order_fake"/);
    expect(DdlExporter.export(model, 'postgresql')).not.toContain('fk_order_fake');
  });

  it('keeps a test table\'s FK inline on SQLite', () => {
    const ddl = DdlExporter.exportTest(withTestData(), 'sqlite');
    expect(ddl).toContain('CONSTRAINT "fk_fake_user" FOREIGN KEY ("user_id")');
    expect(ddl).not.toContain('ALTER TABLE');
  });
});

describe('validation of the test side', () => {
  it('is left out of production checks', () => {
    const model = clone(withTestData());
    tableOf(model, 't_fake').physicalName = '';
    expect(validateModel(model)).toHaveLength(1);
  });
});
