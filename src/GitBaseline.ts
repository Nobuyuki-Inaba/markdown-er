import * as cp from 'child_process';
import * as path from 'path';
import type * as vscode from 'vscode';
import { DiagramModel } from '../shared/DiagramModel';
import { ErmdParser } from './ErmdParser';

/** The diagram as committed at `ref` (e.g. HEAD~1), read with `git show`. */
export function loadGitBaseline(fileUri: vscode.Uri, ref: string): Promise<DiagramModel> {
  const trimmed = ref.trim();
  if (!trimmed || trimmed.startsWith('-')) {
    return Promise.reject(new Error(`invalid git ref "${ref}"`));
  }
  // `<ref>:./<file>` is resolved relative to cwd, so it works wherever the repository root is.
  // execFile passes arguments without a shell.
  return new Promise((resolve, reject) => {
    cp.execFile(
      'git',
      ['show', `${trimmed}:./${path.basename(fileUri.fsPath)}`],
      { cwd: path.dirname(fileUri.fsPath), maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) { return reject(new Error((stderr || err.message).trim())); }
        resolve(ErmdParser.parse(stdout));
      }
    );
  });
}
