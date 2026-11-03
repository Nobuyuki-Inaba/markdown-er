import { describe, expect, it } from 'vitest';
import { generateMarkdownDocs, mermaidErDiagram } from '../../src/format/MarkdownDocs';
import { ErmdParser } from '../../src/ErmdParser';
import { ErmdSerializer } from '../../src/ErmdSerializer';
import { col, shopModel, table } from '../fixtures';

const both = { mermaid: true, tableDocs: true, locale: 'en' as const };

describe('generateMarkdownDocs', () => {
  it('is undefined when both parts are off (the default)', () => {
    expect(generateMarkdownDocs(shopModel(), { mermaid: false, tableDocs: false, locale: 'en' })).toBeUndefined();
  });

  it('writes only the parts that are on', () => {
    const mermaidOnly = generateMarkdownDocs(shopModel(), { ...both, tableDocs: false })!;
    expect(mermaidOnly).toContain('```mermaid\nerDiagram');
    expect(mermaidOnly).not.toContain('## Table Definitions');
    const docsOnly = generateMarkdownDocs(shopModel(), { ...both, mermaid: false })!;
    expect(docsOnly).not.toContain('mermaid');
    expect(docsOnly).toContain('## Table Definitions');
  });

  it('uses Japanese headings for the ja locale', () => {
    const text = generateMarkdownDocs(shopModel(), { ...both, locale: 'ja' })!;
    expect(text).toContain('## ER 図');
    expect(text).toContain('## テーブル定義');
    expect(text).toContain('| # | 論理名 | 物理名 | 型 |');
  });

  it('matches the expected output for the shop model', () => {
    expect(generateMarkdownDocs(shopModel(), both)).toMatchSnapshot();
  });
});

describe('mermaidErDiagram', () => {
  it('marks primary and foreign keys and maps cardinalities', () => {
    const text = mermaidErDiagram(shopModel());
    expect(text).toContain('    INT id PK');
    expect(text).toContain('    INT user_id PK, FK'); // profiles.user_id
    expect(text).toContain('  users ||--|| profiles : "fk_profile_user"');
    expect(text).toContain('  users ||--o{ orders : "fk_order_user"');
    expect(text).toContain('  products ||--o{ order_items : ""');
  });

  it('labels columns with their logical name and leaves out sizes Mermaid cannot read', () => {
    const text = mermaidErDiagram(shopModel());
    expect(text).toContain('    VARCHAR name "ユーザー名"');
    expect(text).toContain('    DECIMAL total');
    expect(text).not.toMatch(/\(\d/);
  });

  it('makes names Mermaid can parse, unique per table', () => {
    const model = shopModel();
    model.tables = [
      table('a', 'order items', [col('a1', '1st col', 'd_id', { logicalName: 'say "hi"' })]),
      table('b', 'order-items', []),
      table('c', 'order_items', []),
      table('d', 'order_items', []),
      table('e', '注文', []),
    ];
    model.relations = [];
    const text = mermaidErDiagram(model);
    expect(text).toContain('  order_items {\n    INT _1st_col "say \'hi\'"');
    expect(text).toContain('  order-items {');
    expect(text).toContain('  order_items_2 {');
    expect(text).toContain('  order_items_3 {');
    expect(text).toContain('  __ {');
  });

  it('skips relations to tables that no longer exist', () => {
    const model = shopModel();
    model.tables = model.tables.filter((t) => t.id !== 't_products');
    expect(mermaidErDiagram(model)).not.toContain('order_items : ""');
  });
});

describe('table docs', () => {
  it('escapes pipes and line breaks in cells', () => {
    const model = shopModel();
    model.tables = [table('t', 'notes', [col('c', 'body', 'd_name', { comment: 'a | b\nsecond line', isNullable: true })],
      { comment: 'Free | text' })];
    const text = generateMarkdownDocs(model, { ...both, mermaid: false })!;
    expect(text).toContain('Free \\| text');
    expect(text).toContain('| 1 | body | body | VARCHAR(100) |  |  |  | a \\| b<br>second line |');
  });

  it('shows the full type, PK, NOT NULL and defaults', () => {
    const text = generateMarkdownDocs(shopModel(), { ...both, mermaid: false })!;
    expect(text).toContain('### users (ユーザー)');
    expect(text).toContain('| 1 | id | id | INT | ✓ | ✓ |  |  |');
    expect(text).toContain('| 3 | total | total | DECIMAL(10,2) |  | ✓ |  |  |');
    expect(text).toContain('| 3 | active | active | BOOLEAN |  | ✓ | TRUE |  |');
  });
});

describe('generated region in the .ermd file', () => {
  it('does not change the diagram read back', () => {
    const model = shopModel();
    const text = ErmdSerializer.serialize(model, { path: '/w/shop.ermd' }, { generated: generateMarkdownDocs(model, both) });
    expect(text).toContain('```mermaid');
    const parsed = ErmdParser.parse(text);
    expect(parsed.tables).toEqual(model.tables);
    expect(parsed.relations).toEqual(model.relations);
  });
});
