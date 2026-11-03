import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ErmdParser } from '../../src/ErmdParser';
import { ErmdSerializer } from '../../src/ErmdSerializer';
import { ErmdTexts, decode, encode, parseVersionsFile, versionsFileName } from '../../src/format/ErmdCodec';
import { CURRENT_FORMAT_VERSION, NewerFormatError, formatStatus } from '../../src/format/formatVersion';
import {
  FormatMigration, MIGRATIONS, SeparateVersionsMigration, migrateModel, pendingMigrations, planMigration,
} from '../../src/format/migrations';
import { DiagramModel } from '../../shared/DiagramModel';
import { clone, fullModel, shopModel } from '../fixtures';

const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf-8');
const opts = { fileName: 'full.ermd' };
/** A v1 file written by v0.1.0, with two schema versions inline */
const v1Full = (): ErmdTexts => ({ main: fixture('v1/full.ermd'), versions: undefined });

/** Everything but the format version */
function contents(model: DiagramModel) {
  const { version: _version, ...rest } = model;
  return rest;
}

describe('format version', () => {
  it('classifies versions', () => {
    expect(CURRENT_FORMAT_VERSION).toBe(2);
    expect(formatStatus(1)).toBe('old');
    expect(formatStatus(2)).toBe('current');
    expect(formatStatus(3)).toBe('newer');
  });
});

describe('ErmdCodec', () => {
  it('names the versions file after the diagram', () => {
    expect(versionsFileName('sample.ermd')).toBe('sample.ermd.versions.yaml');
  });

  it('starts a new file at the current format version', () => {
    expect(decode({ main: undefined, versions: undefined }).version).toBe(CURRENT_FORMAT_VERSION);
    expect(decode({ main: '', versions: undefined }).version).toBe(CURRENT_FORMAT_VERSION);
  });

  it('reads a file without a version as version 1', () => {
    expect(decode({ main: '---\ner-diagram: true\n---\n', versions: undefined }).version).toBe(1);
  });

  it('keeps v1 files in one file, unchanged', () => {
    const texts = v1Full();
    const model = decode(texts);
    expect(model.version).toBe(1);
    expect(model.schemaVersions).toHaveLength(2);
    const out = encode(model, texts, opts);
    expect(out.versions).toBeNull();
    expect(out.main).toContain('version: 1');
    expect(out.main).toContain('```ermd-versions');
    expect(contents(decode({ main: out.main, versions: undefined }))).toEqual(contents(model));
    // Saving again changes nothing
    const again = { main: out.main, versions: undefined };
    expect(encode(decode(again), again, opts).main).toBe(out.main);
  });

  it('writes v2 schema versions to the versions file only', () => {
    const model = { ...fullModel(), version: 2 };
    const out = encode(model, { main: undefined, versions: undefined }, opts);
    expect(out.main).not.toContain('ermd-versions');
    expect(out.main).toContain('version: 2');
    expect(parseVersionsFile(out.versions!)).toEqual(model.schemaVersions);
    expect(decode({ main: out.main, versions: out.versions! })).toEqual(model);
  });

  it('writes no versions file when there are no versions', () => {
    const model = { ...shopModel(), version: 2 };
    expect(encode(model, { main: undefined, versions: undefined }, opts).versions).toBeNull();
  });

  it('keeps using an existing versions file even for a v1 file', () => {
    const texts: ErmdTexts = { main: fixture('v1/full.ermd'), versions: '[]\n' };
    const out = encode(decode(texts), texts, opts);
    expect(out.main).not.toContain('ermd-versions');
    expect(parseVersionsFile(out.versions!)).toHaveLength(2);
  });

  it('merges versions an older extension added to the .ermd file', () => {
    const model = fullModel();
    const [first, second] = model.schemaVersions!;
    // The versions file has v1; an older extension then appended v2 inline
    const main = encode({ ...model, version: 1, schemaVersions: [second] }, { main: undefined, versions: undefined }, opts).main
      .replace('version: 1', 'version: 2');
    const versions = encode({ ...model, version: 2, schemaVersions: [first] }, { main: undefined, versions: undefined }, opts).versions!;
    const merged = decode({ main, versions });
    expect(merged.schemaVersions!.map((v) => v.id)).toEqual(['ver_1', 'ver_2']);
    // The next save moves it into the versions file
    const out = encode(merged, { main, versions }, opts);
    expect(out.main).not.toContain('ermd-versions');
    expect(parseVersionsFile(out.versions!).map((v) => v.id)).toEqual(['ver_1', 'ver_2']);
  });

  it('drops a duplicate version found in both places', () => {
    const model = fullModel();
    const main = encode({ ...model, version: 1 }, { main: undefined, versions: undefined }, opts).main;
    const versions = encode({ ...model, version: 2 }, { main: undefined, versions: undefined }, opts).versions!;
    expect(decode({ main, versions }).schemaVersions!.map((v) => v.id)).toEqual(['ver_1', 'ver_2']);
  });

  it('reads an empty versions file as no versions and ignores one it cannot read', () => {
    expect(parseVersionsFile('')).toEqual([]);
    expect(parseVersionsFile('# only a comment\n')).toEqual([]);
    expect(parseVersionsFile('- [unclosed')).toEqual([]);
    expect(parseVersionsFile('name: not a list')).toEqual([]);
  });

  it('never overwrites or deletes a versions file it cannot read', () => {
    for (const broken of ['- [unclosed', 'name: not a list']) {
      const model = { ...fullModel(), version: 2 };
      const out = encode(model, { main: undefined, versions: broken }, opts);
      expect(out.versions).toBeUndefined();
      // The versions are kept in the .ermd file instead
      expect(decode({ main: out.main, versions: broken }).schemaVersions).toEqual(model.schemaVersions);
    }
  });

  it('writes the generated Markdown when asked to', () => {
    const docs = { mermaid: true, tableDocs: false, locale: 'en' as const };
    const out = encode({ ...shopModel(), version: 2 }, { main: undefined, versions: undefined }, { ...opts, docs });
    expect(out.main).toContain('```mermaid\nerDiagram');
    expect(encode({ ...shopModel(), version: 2 }, { main: out.main, versions: undefined }, opts).main)
      .not.toContain('mermaid');
  });

  it('refuses to write a file newer than it understands', () => {
    const model = { ...shopModel(), version: CURRENT_FORMAT_VERSION + 1 };
    expect(() => encode(model, { main: undefined, versions: undefined }, opts)).toThrow(NewerFormatError);
  });
});

describe('pendingMigrations / migrateModel', () => {
  it('has a step from every old version to the current one', () => {
    for (let v = 1; v < CURRENT_FORMAT_VERSION; v++) {
      expect(pendingMigrations(v).map((m) => m.to)).toEqual(
        Array.from({ length: CURRENT_FORMAT_VERSION - v }, (_, i) => v + i + 1));
    }
    expect(MIGRATIONS[0]).toBeInstanceOf(SeparateVersionsMigration);
  });

  it('has nothing to do for the current version and refuses newer ones', () => {
    expect(pendingMigrations(CURRENT_FORMAT_VERSION)).toEqual([]);
    expect(() => pendingMigrations(CURRENT_FORMAT_VERSION + 1)).toThrow(NewerFormatError);
  });

  it('applies steps in order, each seeing the result of the one before', () => {
    class Rename extends FormatMigration {
      constructor(readonly from: number, private readonly suffix: string) { super(); }
      describe() { return `rename ${this.suffix}`; }
      protected transform(model: DiagramModel): DiagramModel {
        return { ...model, tables: model.tables.map((t) => ({ ...t, physicalName: t.physicalName + this.suffix })) };
      }
    }
    // Registered out of order on purpose
    const steps = [new Rename(2, '_b'), new Rename(1, '_a')];
    const { model, applied } = migrateModel({ ...shopModel(), version: 1 }, steps, 3);
    expect(applied.map((m) => m.from)).toEqual([1, 2]);
    expect(model.version).toBe(3);
    expect(model.tables[0].physicalName).toBe('users_a_b');
  });

  it('fails when a step is missing', () => {
    expect(() => pendingMigrations(1, [], 2)).toThrow(/no migration from format version 1/);
  });

  it('does not change the model it is given', () => {
    const model = { ...fullModel(), version: 1 };
    const before = clone(model);
    migrateModel(model);
    expect(model).toEqual(before);
  });

  it('describes each step in English and Japanese', () => {
    for (const m of MIGRATIONS) {
      expect(m.describe('en')).toMatch(/\S/);
      expect(m.describe('ja')).toMatch(/\S/);
    }
  });
});

describe('planMigration: v1 → v2 (existing users)', () => {
  it('moves the schema versions to the versions file without losing data', () => {
    const texts = v1Full();
    const before = decode(texts);
    const plan = planMigration(texts, opts)!;

    expect(plan.from).toBe(1);
    expect(plan.to).toBe(2);
    expect(plan.applied.map((m) => m.constructor.name)).toEqual(['SeparateVersionsMigration']);
    expect(plan.texts.main).toMatch(/^---\ner-diagram: true\nversion: 2\n---\n/);
    expect(plan.texts.main).not.toContain('```ermd-versions');
    expect(plan.texts.main).not.toContain('## Versions');
    expect(parseVersionsFile(plan.texts.versions!)).toEqual(before.schemaVersions);

    // Every part of the diagram reads back the same
    const after = decode({ main: plan.texts.main, versions: plan.texts.versions! });
    expect(after.version).toBe(2);
    expect(contents(after)).toEqual(contents(before));
  });

  it('matches the expected files', async () => {
    const plan = planMigration(v1Full(), opts)!;
    await expect(plan.texts.main).toMatchFileSnapshot('../fixtures/v2/full.ermd');
    await expect(plan.texts.versions).toMatchFileSnapshot('../fixtures/v2/full.ermd.versions.yaml');
  });

  it('changes only the version line of a file without schema versions', () => {
    // As on disk after a save (the parser fixes key order), without the versions section
    const saved = ErmdSerializer.serialize(ErmdParser.parse(fixture('v1/full.ermd')), { path: '/work/full.ermd' });
    const main = saved.replace(/\n\n## Versions\n\n```ermd-versions[\s\S]*?```/, '');
    const texts: ErmdTexts = { main, versions: undefined };
    expect(decode(texts).schemaVersions ?? []).toEqual([]);
    const plan = planMigration(texts, opts)!;
    expect(plan.texts.versions).toBeNull();
    expect(plan.texts.main).toBe(main.replace('version: 1', 'version: 2'));
  });

  it('keeps the text written outside the blocks', () => {
    const main = fixture('v1/full.ermd')
      .replace('# full\n', '# Shop\n\nNotes about the shop schema.\n')
      .replace('## Versions\n', '## History\n\nReleased as v2 in February.\n\n## Versions\n');
    const plan = planMigration({ main, versions: undefined }, opts)!;
    expect(plan.texts.main).toContain('# Shop\n\nNotes about the shop schema.');
    expect(plan.texts.main).toContain('## History\n\nReleased as v2 in February.');
    expect(plan.texts.main).not.toContain('ermd-versions');
  });

  it('migrates the bundled sample, keeping its title', () => {
    const main = readFileSync(join(__dirname, '../../examples/sample.ermd'), 'utf-8');
    const before = decode({ main, versions: undefined });
    const plan = planMigration({ main, versions: undefined }, { fileName: 'sample.ermd' })!;
    expect(plan.texts.main).toContain('# EC Site ER Diagram');
    expect(contents(decode({ main: plan.texts.main, versions: plan.texts.versions ?? undefined }))).toEqual(contents(before));
  });

  it('merges a versions file that already exists', () => {
    const extra = { ...fullModel().schemaVersions![0], id: 'ver_0', name: 'v0' };
    const texts: ErmdTexts = { main: fixture('v1/full.ermd'), versions: `- ${JSON.stringify(extra)}\n` };
    const plan = planMigration(texts, opts)!;
    expect(parseVersionsFile(plan.texts.versions!).map((v) => v.id)).toEqual(['ver_0', 'ver_1', 'ver_2']);
  });

  it('is done once: a migrated file needs nothing more', () => {
    const plan = planMigration(v1Full(), opts)!;
    expect(planMigration({ main: plan.texts.main, versions: plan.texts.versions! }, opts)).toBeNull();
  });

  it('leaves current files alone and refuses newer ones', () => {
    const current = encode({ ...shopModel(), version: 2 }, { main: undefined, versions: undefined }, opts);
    expect(planMigration({ main: current.main, versions: undefined }, opts)).toBeNull();
    const newer = current.main.replace('version: 2', 'version: 3');
    expect(() => planMigration({ main: newer, versions: undefined }, opts)).toThrow(NewerFormatError);
  });

  it('still lets the previous extension read the migrated diagram', () => {
    // v0.1.0 only parses the .ermd file: the diagram itself must be complete there
    const plan = planMigration(v1Full(), opts)!;
    const old = ErmdParser.parse(plan.texts.main);
    const before = decode(v1Full());
    expect(old.tables).toEqual(before.tables);
    expect(old.relations).toEqual(before.relations);
    expect(old.dictionary).toEqual(before.dictionary);
    expect(old.layout).toEqual(before.layout);
    expect(old.version).toBe(2);
  });
});
