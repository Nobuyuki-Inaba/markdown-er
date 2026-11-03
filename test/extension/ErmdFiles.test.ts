import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Uri, workspace } from 'vscode';
import { mock } from '../mocks/vscode';
import { readDiagram, versionsUri, writeDiagram } from '../../src/ErmdFiles';
import { ErmdTexts, parseVersionsFile } from '../../src/format/ErmdCodec';
import { CURRENT_FORMAT_VERSION, NewerFormatError } from '../../src/format/formatVersion';
import { fullModel } from '../fixtures';

const MAIN = '/work/full.ermd';
const VERSIONS = '/work/full.ermd.versions.yaml';
const uri = Uri.file(MAIN);
const v1 = readFileSync(join(__dirname, '../fixtures/v1/full.ermd'), 'utf-8');

beforeEach(() => {
  mock.reset();
  vi.restoreAllMocks();
});

describe('ErmdFiles', () => {
  it('puts the versions file next to the diagram', () => {
    expect(versionsUri(uri).path).toBe(VERSIONS);
  });

  it('reads a v1 file as it is', async () => {
    mock.write(MAIN, v1);
    const { model } = await readDiagram(uri);
    expect(model.version).toBe(1);
    expect(model.schemaVersions).toHaveLength(2);
  });

  it('starts a missing or empty file at the current format', async () => {
    expect((await readDiagram(uri)).model.version).toBe(CURRENT_FORMAT_VERSION);
    mock.write(MAIN, '');
    expect((await readDiagram(uri)).model.version).toBe(CURRENT_FORMAT_VERSION);
  });

  it('saves a v1 file in one file, keeping its text and format', async () => {
    mock.write(MAIN, v1.replace('# full\n', '# full\n\nWritten by hand.\n'));
    const { model } = await readDiagram(uri);
    model.tables[0].comment = 'edited';
    await writeDiagram(uri, model);
    const text = mock.read(MAIN)!;
    expect(text).toContain('version: 1');
    expect(text).toContain('Written by hand.');
    expect(text).toContain('```ermd-versions');
    expect(text).toContain('comment: edited');
    expect(mock.read(VERSIONS)).toBeUndefined();
  });

  it('saves v2 schema versions to the versions file and deletes it when they are all gone', async () => {
    const model = { ...fullModel(), version: 2 };
    await writeDiagram(uri, model);
    expect(mock.read(MAIN)).not.toContain('ermd-versions');
    expect(parseVersionsFile(mock.read(VERSIONS))).toHaveLength(2);

    await writeDiagram(uri, { ...model, schemaVersions: [] });
    expect(mock.read(VERSIONS)).toBeUndefined();
  });

  it('does not write files whose text is unchanged', async () => {
    const model = { ...fullModel(), version: 2 };
    await writeDiagram(uri, model);
    const writeFile = vi.spyOn(workspace.fs, 'writeFile');
    await writeDiagram(uri, model);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('never overwrites or deletes a versions file it cannot read', async () => {
    mock.write(VERSIONS, '- [broken');
    await writeDiagram(uri, { ...fullModel(), version: 2, schemaVersions: [] });
    expect(mock.read(VERSIONS)).toBe('- [broken');
    await writeDiagram(uri, { ...fullModel(), version: 2 });
    expect(mock.read(VERSIONS)).toBe('- [broken');
  });

  it('refuses to save a file newer than the extension, leaving it untouched', async () => {
    const newer = v1.replace('version: 1', `version: ${CURRENT_FORMAT_VERSION + 1}`);
    mock.write(MAIN, newer);
    const { model } = await readDiagram(uri);
    await expect(writeDiagram(uri, model)).rejects.toThrow(NewerFormatError);
    expect(mock.read(MAIN)).toBe(newer);
  });

  it('writes the generated Markdown only while a setting is on', async () => {
    const model = { ...fullModel(), version: 2 };
    mock.config.set('markdown-er.markdown.generateMermaid', true);
    await writeDiagram(uri, model);
    expect(mock.read(MAIN)).toContain('```mermaid');
    expect(mock.read(MAIN)).not.toContain('## Table Definitions');

    mock.config.set('markdown-er.markdown.generateMermaid', false);
    mock.config.set('markdown-er.markdown.generateTableDocs', true);
    mock.language = 'ja';
    await writeDiagram(uri, model);
    expect(mock.read(MAIN)).not.toContain('```mermaid');
    expect(mock.read(MAIN)).toContain('## テーブル定義');

    mock.config.set('markdown-er.markdown.generateTableDocs', false);
    await writeDiagram(uri, model);
    expect(mock.read(MAIN)).not.toContain('markdown-er:generated');
  });

  it('reports the texts the files will have before writing them', async () => {
    mock.write(VERSIONS, '- [broken');
    let onDisk: ErmdTexts | undefined;
    await writeDiagram(uri, { ...fullModel(), version: 2 }, (texts) => {
      onDisk = texts;
      expect(mock.read(MAIN)).toBeUndefined(); // not written yet
    });
    expect(onDisk).toEqual({ main: mock.read(MAIN), versions: '- [broken' });
  });
});
