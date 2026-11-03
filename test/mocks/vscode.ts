/**
 * In-memory stand-in for the `vscode` module (aliased in vitest.config.ts), enough to test the
 * extension's file handling and migration prompts. Tests drive it through `mock`.
 */

export class Uri {
  private constructor(readonly scheme: string, readonly path: string, readonly query = '') {}
  static file(path: string) { return new Uri('file', path.replace(/\\/g, '/')); }
  static parse(value: string) { return Uri.file(value.replace(/^file:\/\//, '')); }
  static from(c: { scheme: string; path: string; query?: string }) { return new Uri(c.scheme, c.path, c.query); }
  static joinPath(base: Uri, ...parts: string[]) {
    const segments = base.path.split('/');
    for (const part of parts) {
      if (part === '..') { segments.pop(); } else { segments.push(part); }
    }
    return new Uri(base.scheme, segments.join('/'));
  }
  get fsPath() { return this.path; }
  toString() { return `${this.scheme}://${this.path}${this.query ? `?${this.query}` : ''}`; }
}

export class FileSystemError extends Error {
  constructor(readonly code: string) { super(code); }
}

export class Position {
  constructor(readonly offset: number) {}
}

export class Range {
  constructor(readonly start: Position, readonly end: Position) {}
}

export class EventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];
  event = (listener: (e: T) => void) => { this.listeners.push(listener); return { dispose() {} }; };
  fire(e: T) { this.listeners.forEach((l) => l(e)); }
  dispose() {}
}

type Edit =
  | { kind: 'replace'; uri: Uri; range: Range; text: string }
  | { kind: 'create'; uri: Uri; contents?: Uint8Array; overwrite?: boolean };

export class WorkspaceEdit {
  readonly edits: Edit[] = [];
  replace(uri: Uri, range: Range, text: string) { this.edits.push({ kind: 'replace', uri, range, text }); }
  createFile(uri: Uri, options: { contents?: Uint8Array; overwrite?: boolean } = {}) {
    this.edits.push({ kind: 'create', uri, ...options });
  }
}

/** A dialog answer: the button label to click (undefined = dismissed) */
type Answer = string | undefined | ((message: string, buttons: string[]) => string | undefined);

export const mock = {
  files: new Map<string, string>(),
  /** Open editors with unsaved text */
  dirty: new Map<string, string>(),
  config: new Map<string, unknown>(),
  workspaceState: new Map<string, unknown>(),
  language: 'en',
  answers: [] as Answer[],
  quickPick: undefined as ((items: { label: string }[]) => { label: string }[] | undefined) | undefined,
  messages: [] as { level: 'info' | 'warning' | 'error'; message: string; buttons: string[]; modal: boolean }[],
  commands: [] as { command: string; args: unknown[] }[],
  appliedEdits: 0,

  reset() {
    this.files.clear();
    this.dirty.clear();
    this.config.clear();
    this.workspaceState.clear();
    this.language = 'en';
    this.answers = [];
    this.quickPick = undefined;
    this.messages = [];
    this.commands = [];
    this.appliedEdits = 0;
  },
  read(path: string) { return this.files.get(path); },
  write(path: string, text: string) { this.files.set(path, text); },
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function show(level: 'info' | 'warning' | 'error') {
  return async (message: string, ...rest: unknown[]) => {
    const options = typeof rest[0] === 'object' && rest[0] !== null ? rest.shift() as { modal?: boolean } : {};
    const buttons = rest as string[];
    mock.messages.push({ level, message, buttons, modal: !!options.modal });
    if (buttons.length === 0) { return undefined; }
    const answer = mock.answers.shift();
    return typeof answer === 'function' ? answer(message, buttons) : answer;
  };
}

export const window = {
  showInformationMessage: show('info'),
  showWarningMessage: show('warning'),
  showErrorMessage: show('error'),
  showQuickPick: async (items: { label: string }[]) => mock.quickPick?.(items),
};

export const commands = {
  executeCommand: async (command: string, ...args: unknown[]) => { mock.commands.push({ command, args }); },
};

export const env = {
  get language() { return mock.language; },
};

function textDocument(uri: Uri) {
  const text = () => mock.dirty.get(uri.path) ?? mock.files.get(uri.path) ?? '';
  return {
    uri,
    get isDirty() { return mock.dirty.has(uri.path); },
    getText: text,
    positionAt: (offset: number) => new Position(offset),
    save: async () => {
      if (mock.dirty.has(uri.path)) {
        mock.files.set(uri.path, mock.dirty.get(uri.path)!);
        mock.dirty.delete(uri.path);
      }
      return true;
    },
  };
}

export const workspace = {
  fs: {
    readFile: async (uri: Uri) => {
      const text = mock.files.get(uri.path);
      if (text === undefined) { throw new FileSystemError('FileNotFound'); }
      return encoder.encode(text);
    },
    writeFile: async (uri: Uri, bytes: Uint8Array) => { mock.files.set(uri.path, decoder.decode(bytes)); },
    delete: async (uri: Uri) => { mock.files.delete(uri.path); },
  },
  getConfiguration: (section: string) => ({
    get: <T>(key: string, fallback: T): T =>
      (mock.config.has(`${section}.${key}`) ? mock.config.get(`${section}.${key}`) : fallback) as T,
  }),
  openTextDocument: async (uri: Uri) => textDocument(uri),
  /** Text edits go to the editor (unsaved until save()); file creations go to disk */
  applyEdit: async (edit: WorkspaceEdit) => {
    mock.appliedEdits++;
    for (const e of edit.edits) {
      if (e.kind === 'replace') {
        const text = textDocument(e.uri).getText();
        mock.dirty.set(e.uri.path, text.slice(0, e.range.start.offset) + e.text + text.slice(e.range.end.offset));
      } else {
        if (mock.files.has(e.uri.path) && !e.overwrite) { return false; }
        mock.files.set(e.uri.path, decoder.decode(e.contents ?? new Uint8Array()));
      }
    }
    return true;
  },
  findFiles: async (include: string) => {
    const ext = include.replace('**/*', '');
    return [...mock.files.keys()].filter((p) => p.endsWith(ext)).sort().map((p) => Uri.file(p));
  },
  asRelativePath: (uri: Uri) => uri.path.replace(/^\/work\//, ''),
  registerTextDocumentContentProvider: () => ({ dispose() {} }),
};

export function extensionContext() {
  return {
    subscriptions: [] as { dispose(): void }[],
    workspaceState: {
      get: <T>(key: string, fallback: T): T => (mock.workspaceState.get(key) as T) ?? fallback,
      update: async (key: string, value: unknown) => { mock.workspaceState.set(key, value); },
    },
  };
}
