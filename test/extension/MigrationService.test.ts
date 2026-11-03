import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Uri } from 'vscode';
import { extensionContext, mock } from '../mocks/vscode';
import { MigrationService } from '../../src/MigrationService';
import { decode, parseVersionsFile } from '../../src/format/ErmdCodec';
import { CURRENT_FORMAT_VERSION } from '../../src/format/formatVersion';

const MAIN = '/work/full.ermd';
const VERSIONS = '/work/full.ermd.versions.yaml';
const uri = Uri.file(MAIN);
const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf-8');
/** A v1 file written by v0.1.0 (two schema versions inline), with a note written by hand */
const v1 = fixture('v1/full.ermd').replace('# full\n', '# full\n\nWritten by hand.\n');

let context: ReturnType<typeof extensionContext>;
let flush: ReturnType<typeof vi.fn>;
let service: MigrationService;

function newSession() {
  flush = vi.fn(async () => {});
  service = new MigrationService(context as never, flush as never);
}

beforeEach(() => {
  mock.reset();
  mock.write(MAIN, v1);
  context = extensionContext();
  newSession();
});

const prompts = () => mock.messages.filter((m) => m.buttons.length > 0);
const isMigrated = () => decode({ main: mock.read(MAIN), versions: mock.read(VERSIONS) }).version === CURRENT_FORMAT_VERSION;

function expectMigrated() {
  const main = mock.read(MAIN)!;
  expect(main).toContain('version: 2');
  expect(main).toContain('Written by hand.');
  expect(main).not.toContain('ermd-versions');
  expect(parseVersionsFile(mock.read(VERSIONS)).map((v) => v.id)).toEqual(['ver_1', 'ver_2']);
  // Nothing of the diagram is lost
  const { version: _a, ...before } = decode({ main: v1, versions: undefined });
  const { version: _b, ...after } = decode({ main, versions: mock.read(VERSIONS) });
  expect(after).toEqual(before);
}

function expectUntouched() {
  expect(mock.read(MAIN)).toBe(v1);
  expect(mock.read(VERSIONS)).toBeUndefined();
}

describe('prompt when an old file is opened', () => {
  it('updates the file only when the user clicks Update', async () => {
    mock.answers.push('Update');
    await service.promptOnOpen(uri);
    expect(prompts()).toHaveLength(1);
    expect(prompts()[0].message).toContain('full.ermd uses an older file format (v1)');
    expect(prompts()[0].message).toContain('separate file');
    expect(prompts()[0].message).toContain('older version of the extension');
    expect(prompts()[0].buttons).toEqual(['Update', 'Show changes', 'Not now', "Don't ask for this file"]);
    expectMigrated();
    expect(mock.messages.at(-1)!.message).toBe('Updated full.ermd to file format v2.');
  });

  it('writes pending diagram edits before updating', async () => {
    mock.answers.push('Update');
    await service.promptOnOpen(uri);
    expect(flush).toHaveBeenCalledWith(uri);
  });

  it('changes nothing for Not now or a dismissed prompt, and asks only once per session', async () => {
    mock.answers.push('Not now');
    await service.promptOnOpen(uri);
    expectUntouched();
    await service.promptOnOpen(uri);
    expect(prompts()).toHaveLength(1);

    newSession();
    mock.answers.push(undefined);
    await service.promptOnOpen(uri);
    expect(prompts()).toHaveLength(2);
    expectUntouched();
  });

  it("stops asking for the file after Don't ask, also in later sessions", async () => {
    mock.answers.push("Don't ask for this file");
    await service.promptOnOpen(uri);
    expectUntouched();
    newSession();
    await service.promptOnOpen(uri);
    expect(prompts()).toHaveLength(1);
  });

  it('never asks when the setting is never', async () => {
    mock.config.set('markdown-er.migration.prompt', 'never');
    await service.promptOnOpen(uri);
    expect(mock.messages).toEqual([]);
    expectUntouched();
  });

  it('shows the proposed file, then asks again', async () => {
    mock.answers.push('Show changes', 'Update');
    await service.promptOnOpen(uri);
    const diff = mock.commands.find((c) => c.command === 'vscode.diff')!;
    expect((diff.args[0] as Uri).path).toBe(MAIN);
    expect((diff.args[1] as Uri).scheme).toBe('markdown-er-migrated');
    expect(diff.args[2]).toBe('full.ermd: v1 ↔ v2 (proposed)');
    expect(prompts()).toHaveLength(2);
    expectMigrated();
  });

  it('does not ask about a current file', async () => {
    mock.answers.push('Update');
    await service.promptOnOpen(uri);
    mock.messages = [];
    newSession();
    await service.promptOnOpen(uri);
    expect(mock.messages).toEqual([]);
  });

  it('asks in Japanese for the ja locale', async () => {
    mock.language = 'ja';
    mock.answers.push((_message, buttons) => buttons[2]);
    await service.promptOnOpen(uri);
    expect(prompts()[0].message).toContain('full.ermd は古いファイル形式（v1）です。');
    expect(prompts()[0].buttons).toEqual(['更新する', '変更内容を見る', '今回はしない', 'このファイルでは今後表示しない']);
    expectUntouched();
  });
});

describe('updating the file', () => {
  it('does not update a file with unsaved edits in an editor', async () => {
    mock.dirty.set(MAIN, `${v1}\nunsaved`);
    mock.answers.push('Update');
    await service.migrateFile(uri);
    expectUntouched();
    expect(mock.messages.at(-1)).toMatchObject({ level: 'warning', message: expect.stringContaining('unsaved changes') });
  });

  it('starts from the file as it is when Update is clicked', async () => {
    mock.answers.push(() => {
      // Edited after the prompt appeared
      mock.write(MAIN, v1.replace('Written by hand.', 'Edited meanwhile.'));
      return 'Update';
    });
    await service.migrateFile(uri);
    expect(mock.read(MAIN)).toContain('Edited meanwhile.');
    expect(mock.read(MAIN)).toContain('version: 2');
  });

  it('merges a versions file that already exists', async () => {
    const extra = { ...parseVersionsFile(fixture('v2/full.ermd.versions.yaml'))[0], id: 'ver_0' };
    mock.write(VERSIONS, `- ${JSON.stringify(extra)}\n`);
    mock.answers.push('Update');
    await service.migrateFile(uri);
    expect(parseVersionsFile(mock.read(VERSIONS)).map((v) => v.id)).toEqual(['ver_0', 'ver_1', 'ver_2']);
  });
});

describe('Migrate command', () => {
  it('asks in a dialog with the details, then updates', async () => {
    mock.answers.push('Update');
    await service.migrateFile(uri);
    const dialog = prompts()[0];
    expect(dialog.modal).toBe(true);
    expect(dialog.buttons).toEqual(['Update', 'Show changes']);
    expectMigrated();
  });

  it('works even after the prompt was turned off', async () => {
    mock.config.set('markdown-er.migration.prompt', 'never');
    mock.workspaceState.set('markdown-er.migration.dismissed', [uri.toString()]);
    mock.answers.push('Update');
    await service.migrateFile(uri);
    expectMigrated();
  });

  it('changes nothing when the dialog is cancelled', async () => {
    mock.answers.push(undefined);
    await service.migrateFile(uri);
    expectUntouched();
  });

  it('says so when the file is already current', async () => {
    mock.answers.push('Update');
    await service.migrateFile(uri);
    mock.messages = [];
    await service.migrateFile(uri);
    expect(mock.messages).toEqual([
      { level: 'info', message: 'full.ermd already uses the current file format (v2).', buttons: [], modal: false },
    ]);
  });

  it('refuses a file newer than the extension', async () => {
    const newer = v1.replace('version: 1', 'version: 3');
    mock.write(MAIN, newer);
    await service.migrateFile(uri);
    expect(mock.messages[0]).toMatchObject({ level: 'warning', message: expect.stringContaining('read-only') });
    expect(mock.read(MAIN)).toBe(newer);
  });
});

describe('Migrate workspace command', () => {
  beforeEach(() => {
    mock.write('/work/sub/other.ermd', fixture('v1/empty.ermd'));
    mock.write('/work/current.ermd', fixture('v2/full.ermd'));
    mock.write('/work/newer.ermd', fixture('v2/full.ermd').replace('version: 2', 'version: 3'));
  });

  it('lists only old files and updates the ones picked', async () => {
    let listed: string[] = [];
    mock.quickPick = (items) => {
      listed = items.map((i) => i.label);
      return items;
    };
    await service.migrateWorkspace();
    expect(listed).toEqual(['full.ermd', 'sub/other.ermd']);
    expectMigrated();
    expect(mock.read('/work/sub/other.ermd')).toContain('version: 2');
    expect(mock.read('/work/current.ermd')).toBe(fixture('v2/full.ermd'));
    expect(mock.messages.at(-1)!.message).toBe('Updated 2 of 2 files to the current file format.');
  });

  it('updates only the files picked', async () => {
    mock.quickPick = (items) => items.filter((i) => i.label === 'sub/other.ermd');
    await service.migrateWorkspace();
    expectUntouched();
    expect(mock.read('/work/sub/other.ermd')).toContain('version: 2');
  });

  it('changes nothing when the pick is cancelled', async () => {
    mock.quickPick = () => undefined;
    await service.migrateWorkspace();
    expectUntouched();
    expect(mock.read('/work/sub/other.ermd')).toBe(fixture('v1/empty.ermd'));
  });

  it('says so when every file is current', async () => {
    mock.files.delete(MAIN);
    mock.files.delete('/work/sub/other.ermd');
    await service.migrateWorkspace();
    expect(mock.messages.at(-1)!.message).toBe('Every ER diagram in the workspace uses the current file format.');
    expect(isMigrated()).toBe(true);
  });
});
