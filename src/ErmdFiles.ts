import * as vscode from 'vscode';
import { DiagramModel } from '../shared/DiagramModel';
import { EncodedTexts, ErmdTexts, decode, encode, versionsFileName } from './format/ErmdCodec';
import { MarkdownDocsOptions } from './format/MarkdownDocs';
import { resolveLocale } from './i18n';

/** File access for a diagram: the .ermd file and its schema versions file (see format/ErmdCodec) */

export function fileName(uri: vscode.Uri): string {
  return uri.path.split('/').pop() ?? 'diagram.ermd';
}

export function versionsUri(uri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(uri, '..', versionsFileName(fileName(uri)));
}

/** The file's text, or undefined when it doesn't exist */
export async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
  } catch (err) {
    if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') { return undefined; }
    throw err;
  }
}

export async function readTexts(uri: vscode.Uri): Promise<ErmdTexts> {
  const [main, versions] = await Promise.all([readText(uri), readText(versionsUri(uri))]);
  return { main, versions };
}

export async function readDiagram(uri: vscode.Uri): Promise<{ model: DiagramModel; texts: ErmdTexts }> {
  const texts = await readTexts(uri);
  return { model: decode(texts), texts };
}

/** `markdown-er.markdown.*`: Markdown generated into the file on save (off by default) */
export function markdownDocsOptions(): MarkdownDocsOptions | undefined {
  const config = vscode.workspace.getConfiguration('markdown-er.markdown');
  const mermaid = config.get<boolean>('generateMermaid', false);
  const tableDocs = config.get<boolean>('generateTableDocs', false);
  return mermaid || tableDocs ? { mermaid, tableDocs, locale: resolveLocale() } : undefined;
}

/**
 * Write the model, keeping the text outside the blocks of what is on disk now.
 * Files whose text doesn't change are not written. Throws NewerFormatError for a newer format.
 * `beforeWrite` gets the texts the files will have (a file watcher may fire before the write returns).
 */
export async function writeDiagram(
  uri: vscode.Uri,
  model: DiagramModel,
  beforeWrite?: (onDisk: ErmdTexts) => void,
): Promise<EncodedTexts> {
  const current = await readTexts(uri);
  const out = encode(model, current, { fileName: fileName(uri), docs: markdownDocsOptions() });
  beforeWrite?.({
    main: out.main,
    versions: out.versions === undefined ? current.versions : out.versions ?? undefined,
  });
  if (out.main !== current.main) {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(out.main, 'utf-8'));
  }
  if (typeof out.versions === 'string' && out.versions !== current.versions) {
    await vscode.workspace.fs.writeFile(versionsUri(uri), Buffer.from(out.versions, 'utf-8'));
  } else if (out.versions === null && current.versions !== undefined) {
    // Our own file, and every version in it has been deleted
    await vscode.workspace.fs.delete(versionsUri(uri));
  }
  return out;
}
