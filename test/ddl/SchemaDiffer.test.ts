import { describe, expect, it } from 'vitest';
import { SchemaDiffer } from '../../src/ddl';
import { DiagramModel } from '../../shared/DiagramModel';
import { DdlDialect } from '../../shared/messages';
import { DdlStyle } from '../../shared/ddlStyle';
import { clone, col, shopModel, tableOf } from '../fixtures';

function diff(change: (m: DiagramModel) => void, dialect: DdlDialect, style: Partial<DdlStyle> = {}): string {
  const base = shopModel();
  const cur = clone(base);
  change(cur);
  return SchemaDiffer.diff(base, cur, dialect, style);
}

describe('SchemaDiffer', () => {
  it('reports no changes for identical models', () => {
    expect(SchemaDiffer.diff(shopModel(), shopModel(), 'mysql')).toBe('-- No changes detected');
  });

  it('ignores comment changes unless comments are on', () => {
    const change = (m: DiagramModel) => { tableOf(m, 't_users').columns[1].comment = 'changed'; };
    expect(diff(change, 'postgresql')).toBe('-- No changes detected');
    expect(diff(change, 'postgresql', { comments: true })).toBe(`COMMENT ON COLUMN "users"."name" IS 'ユーザー名: changed';`);
  });

  describe('oracle', () => {
    it('modifies only what changed (re-stating NOT NULL is an error)', () => {
      const ddl = diff((m) => { m.dictionary.find((d) => d.id === 'd_name')!.length = 200; }, 'oracle');
      // users.name is NOT NULL, profiles.bio is nullable; neither restates its nullability
      expect(ddl).toBe(
        'ALTER TABLE users MODIFY (name VARCHAR2(200 CHAR));\n\n' +
        'ALTER TABLE profiles MODIFY (bio VARCHAR2(200 CHAR));'
      );
    });

    it('adds columns in parentheses and drops tables with their constraints', () => {
      const ddl = diff((m) => {
        tableOf(m, 't_orders').columns.push(col('o_note', 'note', 'd_name', { isNullable: true, defaultValue: "'-'" }));
        m.tables = m.tables.filter((t) => t.id !== 't_products');
        m.relations = m.relations.filter((r) => r.fromTableId !== 't_products');
      }, 'oracle');
      expect(ddl).toContain(`ALTER TABLE orders ADD (note VARCHAR2(100 CHAR) DEFAULT '-');`);
      expect(ddl).toContain('DROP TABLE products CASCADE CONSTRAINTS;');
    });
  });

  describe('rename column', () => {
    const rename = (m: DiagramModel) => { tableOf(m, 't_users').columns[1].physicalName = 'full_name'; };

    it.each([
      ['mysql', 'ALTER TABLE `users` RENAME COLUMN `name` TO `full_name`;'],
      ['postgresql', 'ALTER TABLE "users" RENAME COLUMN "name" TO "full_name";'],
      ['sqlite', 'ALTER TABLE "users" RENAME COLUMN "name" TO "full_name";'],
      ['sqlserver', "EXEC sp_rename 'users.name', 'full_name', 'COLUMN';"],
    ] as const)('%s', (dialect, expected) => {
      const ddl = diff(rename, dialect);
      expect(ddl).toContain(expected);
      expect(ddl).not.toMatch(/MODIFY|ALTER COLUMN/);
    });
  });

  describe('change column type and nullability', () => {
    const change = (m: DiagramModel) => {
      m.dictionary.find((d) => d.id === 'd_name')!.length = 200;
      tableOf(m, 't_profiles').columns[1].isNullable = false;
    };

    it('mysql restates the column with MODIFY', () => {
      expect(diff(change, 'mysql')).toContain('ALTER TABLE `users` MODIFY COLUMN `name` VARCHAR(200) NOT NULL;');
    });

    it('mysql MODIFY keeps the comment when comments are on', () => {
      expect(diff(change, 'mysql', { comments: true }))
        .toContain("ALTER TABLE `users` MODIFY COLUMN `name` VARCHAR(200) NOT NULL COMMENT 'ユーザー名: display name, can''t be empty';");
    });

    it('postgresql alters each aspect separately', () => {
      const ddl = diff(change, 'postgresql');
      expect(ddl).toContain('ALTER TABLE "users" ALTER COLUMN "name" TYPE VARCHAR(200) USING "name"::VARCHAR(200);');
      expect(ddl).toContain('ALTER TABLE "profiles" ALTER COLUMN "bio" SET NOT NULL;');
    });

    it('sqlserver uses ALTER COLUMN', () => {
      expect(diff(change, 'sqlserver')).toContain('ALTER TABLE [users] ALTER COLUMN [name] NVARCHAR(200) NOT NULL;');
    });

    it('sqlite explains that the table must be recreated', () => {
      const ddl = diff(change, 'sqlite');
      expect(ddl).toBe('-- SQLite: cannot alter column bio on profiles; recreate the table');
      // VARCHAR(100) and VARCHAR(200) are both TEXT in SQLite: not a change
      expect(ddl).not.toContain('column name');
    });

    it('MySQL MODIFY keeps AUTO_INCREMENT', () => {
      const ddl = diff((m) => { tableOf(m, 't_users').columns[0].defaultValue = '0'; }, 'mysql');
      expect(ddl).toContain('MODIFY COLUMN `id` INT AUTO_INCREMENT DEFAULT 0 NOT NULL');
    });
  });

  it.each([
    ['mysql', 'ALTER TABLE `orders` ADD COLUMN `note` VARCHAR(100);'],
    ['sqlserver', 'ALTER TABLE [orders] ADD [note] NVARCHAR(100);'],
  ] as const)('%s: add column', (dialect, expected) => {
    expect(diff((m) => { tableOf(m, 't_orders').columns.push(col('o_note', 'note', 'd_name', { isNullable: true })); }, dialect))
      .toContain(expected);
  });

  describe('foreign keys', () => {
    const dropRelation = (m: DiagramModel) => { m.relations = m.relations.filter((r) => r.id !== 'order_user'); };

    it.each([
      ['mysql', 'ALTER TABLE `orders` DROP FOREIGN KEY `fk_order_user`;'],
      ['postgresql', 'ALTER TABLE "orders" DROP CONSTRAINT "fk_order_user";'],
      ['sqlserver', 'ALTER TABLE [orders] DROP CONSTRAINT [fk_order_user];'],
      ['sqlite', '-- SQLite: cannot drop foreign key fk_order_user on orders; recreate the table'],
    ] as const)('%s: drop', (dialect, expected) => {
      expect(diff(dropRelation, dialect)).toContain(expected);
    });

    it('re-creates a FK whose constraint name changed', () => {
      const ddl = diff((m) => { m.relations.find((r) => r.id === 'order_user')!.constraintName = 'fk_renamed'; }, 'postgresql');
      expect(ddl).toContain('DROP CONSTRAINT "fk_order_user"');
      expect(ddl).toContain('ADD CONSTRAINT "fk_renamed"');
    });
  });

  it.each([
    ['mysql', 'RENAME TABLE `orders` TO `purchases`;'],
    ['postgresql', 'ALTER TABLE "orders" RENAME TO "purchases";'],
    ['sqlite', 'ALTER TABLE "orders" RENAME TO "purchases";'],
    ['sqlserver', "EXEC sp_rename 'orders', 'purchases';"],
  ] as const)('%s: rename table', (dialect, expected) => {
    expect(diff((m) => { Object.assign(tableOf(m, 't_orders'), { physicalName: 'purchases', logicalName: 'purchases' }); }, dialect)).toBe(expected);
  });

  it('drops child tables before their parents, without separate FK drops', () => {
    const ddl = diff((m) => {
      m.tables = m.tables.filter((t) => t.id !== 't_orders' && t.id !== 't_items');
      m.relations = m.relations.filter((r) => r.toTableId !== 't_orders' && r.toTableId !== 't_items');
    }, 'mysql');
    expect(ddl).toBe('DROP TABLE IF EXISTS `order_items`;\n\nDROP TABLE IF EXISTS `orders`;');
  });

  it('SQLite: a new table carries its FKs inline', () => {
    const ddl = diff((m) => {
      m.tables.push({ id: 't_new', physicalName: 'reviews', logicalName: 'reviews', comment: '', columns: [
        col('r_id', 'id', 'd_id', { isPrimaryKey: true }), col('r_user', 'user_id', 'd_id'),
      ] });
      m.relations.push({ id: 'rv', fromTableId: 't_users', fromColumnId: 'u_id', toTableId: 't_new', toColumnId: 'r_user',
        cardinality: 'ONE_TO_MANY', hasForeignKey: true, constraintName: 'fk_rv', comment: '' });
    }, 'sqlite');
    expect(ddl).toContain('CONSTRAINT "fk_rv" FOREIGN KEY ("user_id") REFERENCES "users" ("id")');
    expect(ddl).not.toContain('cannot');
  });

  it.each([
    ['mysql', 'ALTER TABLE `order_items` DROP PRIMARY KEY, ADD PRIMARY KEY (`order_id`);'],
    ['postgresql', 'ALTER TABLE "order_items" DROP CONSTRAINT "order_items_pkey";\n\nALTER TABLE "order_items" ADD PRIMARY KEY ("order_id");'],
  ] as const)('%s: change primary key', (dialect, expected) => {
    expect(diff((m) => { tableOf(m, 't_items').columns[1].isPrimaryKey = false; }, dialect)).toContain(expected);
  });

  it('PostgreSQL adds / drops identity when a key becomes / stops being auto-increment', () => {
    // order_items.order_id becomes the only PK column and is still a FK: no identity
    expect(diff((m) => { tableOf(m, 't_items').columns[1].isPrimaryKey = false; }, 'postgresql')).not.toContain('IDENTITY');
    // products.id becomes a FK child column: loses identity
    const lost = diff((m) => {
      m.relations.push({ id: 'x', fromTableId: 't_users', fromColumnId: 'u_id', toTableId: 't_products', toColumnId: 'pr_id',
        cardinality: 'ONE_TO_ONE', hasForeignKey: false, constraintName: '', comment: '' });
    }, 'postgresql');
    expect(lost).toBe('ALTER TABLE "products" ALTER COLUMN "id" DROP IDENTITY IF EXISTS;');
  });

  it('drops and re-creates a changed index', () => {
    const ddl = diff((m) => { tableOf(m, 't_items').indexes![0].unique = true; }, 'mysql');
    expect(ddl).toBe(
      'DROP INDEX `ix_items_product` ON `order_items`;\n\n' +
      'CREATE UNIQUE INDEX `ix_items_product` ON `order_items` (`product_id`);'
    );
  });
});
