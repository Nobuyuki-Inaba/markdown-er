import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ErmdParser } from '../../src/ErmdParser';
import { ErmdSerializer } from '../../src/ErmdSerializer';
import { DiagramModel, createEmptyModel } from '../../shared/DiagramModel';
import { clone, col, fullModel, shopModel, table } from '../fixtures';

const uri = (name: string) => ({ path: `/work/${name}` });
const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf-8');
const fresh = (model: DiagramModel, name = 'full.ermd') => ErmdSerializer.serialize(model, uri(name));
const merged = (model: DiagramModel, original: string, name = 'full.ermd') =>
  ErmdSerializer.serialize(model, uri(name), { original });

/** Model contents compared after a round trip */
function contents(model: DiagramModel) {
  const { version: _version, ...rest } = model;
  return rest;
}

describe('ErmdSerializer: output unchanged for existing files', () => {
  // Fixtures written by the serializer before text outside blocks was kept (v0.1.0)
  it('writes a new file exactly as before', () => {
    expect(fresh(fullModel())).toBe(fixture('v1/full.ermd'));
    expect(fresh(createEmptyModel(), 'empty.ermd')).toBe(fixture('v1/empty.ermd'));
  });

  it('leaves an unchanged file byte for byte the same', () => {
    // A file as it is on disk after a save: written from a parsed model (the parser fixes key order)
    for (const name of ['full.ermd', 'empty.ermd']) {
      const text = fresh(ErmdParser.parse(fixture(`v1/${name}`)), name);
      expect(merged(ErmdParser.parse(text), text, name)).toBe(text);
    }
  });

  it('gives the same text as a new file after any model change', () => {
    const base = fullModel();
    const variants: Array<[string, (m: DiagramModel) => void]> = [
      ['add a table', (m) => { m.tables.push(table('t_new', 'new_table', [col('n_id', 'id', 'd_id')])); }],
      ['remove a middle table', (m) => { m.tables.splice(2, 1); }],
      ['remove the first table', (m) => { m.tables.shift(); }],
      ['remove every table', (m) => { m.tables = []; }],
      ['remove the dictionary', (m) => { m.dictionary = []; }],
      ['remove the database', (m) => { delete m.database; }],
      ['remove column sets', (m) => { m.columnSets = []; }],
      ['remove relations', (m) => { m.relations = []; }],
      ['remove versions', (m) => { m.schemaVersions = []; }],
      ['edit a column', (m) => { m.tables[1].columns[1].comment = 'changed'; }],
      ['remove everything', (m) => { Object.assign(m, createEmptyModel()); }],
    ];
    for (const [name, change] of variants) {
      const next = clone(base);
      change(next);
      expect(merged(next, fresh(base)), name).toBe(fresh(next));
    }
  });

  it('adds sections to an almost empty file in file order', () => {
    const empty = fresh(createEmptyModel());
    expect(merged(fullModel(), empty)).toBe(fresh(fullModel()));
  });
});

describe('ErmdSerializer: keeps text outside the ermd blocks', () => {
  const prose = (base: string) => base
    .replace('# full\n', '# Shop database\n\nThe order and user tables of the shop.\n')
    .replace('## Tables\n', '## Tables\n\n> Tables are listed in dependency order.\n')
    .replace(/(```ermd-table\nid: t_orders[\s\S]*?```)/, '$1\n\nOrders are never deleted.')
    .replace('## Relations\n', '## Notes\n\n| key | meaning |\n|---|---|\n| id | primary key |\n\n## Relations\n')
    .concat('\nEnd of file note.\n');

  it('keeps the title, notes, tables and prose when the model changes', () => {
    const original = prose(fresh(fullModel()));
    const model = ErmdParser.parse(original);
    model.tables[2].columns.push(col('o_note', 'note', 'd_name'));
    const text = merged(model, original);

    for (const kept of [
      '# Shop database\n\nThe order and user tables of the shop.',
      '> Tables are listed in dependency order.',
      'Orders are never deleted.',
      '| id | primary key |',
      'End of file note.',
    ]) {
      expect(text).toContain(kept);
    }
    expect(text).not.toContain('# full');
    expect(contents(ErmdParser.parse(text))).toEqual(contents(model));
  });

  it('keeps prose next to a removed table', () => {
    const original = prose(fresh(fullModel()));
    const model = ErmdParser.parse(original);
    model.tables = model.tables.filter((t) => t.id !== 't_orders');
    const text = merged(model, original);
    expect(text).not.toContain('```ermd-table\nid: t_orders');
    expect(text).toContain('Orders are never deleted.');
    expect(ErmdParser.parse(text).tables.map((t) => t.id)).toEqual(model.tables.map((t) => t.id));
  });

  it('keeps the title of the bundled sample (no longer replaced by the file name)', () => {
    const sample = readFileSync(join(__dirname, '../../examples/sample.ermd'), 'utf-8');
    const text = merged(ErmdParser.parse(sample), sample, 'sample.ermd');
    expect(text).toContain('# EC Site ER Diagram');
    expect(text).not.toContain('# sample');
  });

  it('keeps other front matter keys and updates the version', () => {
    const original = fresh(shopModel()).replace('version: 1\n', 'version: 1\nowner: data-team\n');
    const text = merged({ ...ErmdParser.parse(original), version: 2 }, original);
    expect(text.startsWith('---\ner-diagram: true\nversion: 2\nowner: data-team\n---\n')).toBe(true);
  });

  it('adds the version to front matter that has none', () => {
    const original = '---\ner-diagram: true\n---\n\n# Hand written\n';
    expect(merged(shopModel(), original)).toMatch(/^---\ner-diagram: true\nversion: 1\n---\n\n# Hand written\n/);
  });

  it('leaves blocks it cannot read and unknown ermd blocks as they are', () => {
    const broken = '```ermd-table\nid: [unclosed\n```';
    const future = '```ermd-future\nkey: value\n```';
    const original = fresh(shopModel()).replace('## Relations', `${broken}\n\n${future}\n\n## Relations`);
    const text = merged(ErmdParser.parse(original), original);
    expect(text).toContain(broken);
    expect(text).toContain(future);
  });

  it('writes one block for a table that appears twice', () => {
    const base = fresh(shopModel());
    const users = base.match(/```ermd-table\nid: t_users[\s\S]*?```/)![0];
    const original = base.replace('## Relations', `${users}\n\n## Relations`);
    const text = merged(shopModel(), original);
    expect(text.match(/id: t_users/g)).toHaveLength(1);
  });

  it('reads CRLF files and writes LF', () => {
    const original = prose(fresh(shopModel())).replace(/\n/g, '\r\n');
    const text = merged(shopModel(), original);
    expect(text).not.toContain('\r');
    expect(text).toContain('End of file note.');
  });

  it('writes a new file when the text is not an ER diagram', () => {
    expect(merged(shopModel(), '# just markdown\n')).toBe(fresh(shopModel()));
  });

  it('can leave the versions out of the file', () => {
    const text = ErmdSerializer.serialize(fullModel(), uri('full.ermd'), { inlineVersions: false });
    expect(text).not.toContain('ermd-versions');
    expect(text).not.toContain('## Versions');
  });
});

describe('ErmdSerializer: generated Markdown region', () => {
  const region = (text: string) => text.match(/<!-- markdown-er:generated:start[\s\S]*?generated:end -->/)?.[0];

  it('is written right after the title and ignored by the parser', () => {
    const text = ErmdSerializer.serialize(shopModel(), uri('shop.ermd'), { generated: '## Generated\n\ncontent' });
    expect(text).toContain('# shop\n\n<!-- markdown-er:generated:start');
    expect(region(text)).toContain('## Generated\n\ncontent');
    expect(text).toMatch(/generated:end -->\n\n## Dictionary/);
    expect(contents(ErmdParser.parse(text))).toEqual(contents(ErmdParser.parse(fresh(shopModel(), 'shop.ermd'))));
  });

  it('is replaced in place, keeping the text around it', () => {
    const first = ErmdSerializer.serialize(shopModel(), uri('shop.ermd'), { generated: 'old' })
      .replace('# shop\n', '# shop\n\nIntro.\n');
    const text = ErmdSerializer.serialize(shopModel(), uri('shop.ermd'), { original: first, generated: 'new' });
    expect(region(text)).toContain('new');
    expect(text).not.toContain('old');
    expect(text).toContain('Intro.');
  });

  it('is removed when turned off, giving the file without it', () => {
    const withRegion = ErmdSerializer.serialize(shopModel(), uri('shop.ermd'), { generated: 'content' });
    const text = ErmdSerializer.serialize(shopModel(), uri('shop.ermd'), { original: withRegion });
    expect(text).toBe(fresh(shopModel(), 'shop.ermd'));
  });
});
