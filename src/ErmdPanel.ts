import * as vscode from 'vscode';
import { ErmdParser } from './ErmdParser';
import { ErmdSerializer } from './ErmdSerializer';
import { DdlExporter, DdlOptions } from './DdlExporter';
import { DdlDiffer } from './DdlDiffer';
import { DiagramModel, SchemaVersion } from '../shared/DiagramModel';
import { DdlDialect, ExtToWebMsg, WebToExtMsg } from '../shared/messages';

export class ErmdPanel {
  public static currentPanel: ErmdPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _fileUri: vscode.Uri;
  private _model: DiagramModel | undefined;
  private _saveVersion = 0;
  private _saveTimer: ReturnType<typeof setTimeout> | undefined;
  private _pendingSave: { model: DiagramModel; version: number } | undefined;
  // Text of our own last write, so the file watcher can ignore it
  private _lastWrittenText: string | undefined;
  private _watcher: vscode.Disposable | undefined;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _outputChannel: vscode.OutputChannel;

  public static createOrShow(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (ErmdPanel.currentPanel) {
      ErmdPanel.currentPanel._panel.reveal(column);
      ErmdPanel.currentPanel._changeFile(fileUri);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'markdownEr',
      'ER Diagram',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      }
    );

    ErmdPanel.currentPanel = new ErmdPanel(
      panel,
      context.extensionUri,
      fileUri,
      vscode.window.createOutputChannel('ER Diagram DDL')
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    fileUri: vscode.Uri,
    outputChannel: vscode.OutputChannel
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._fileUri = fileUri;
    this._outputChannel = outputChannel;

    this._panel.webview.html = this._buildHtml();

    this._panel.webview.onDidReceiveMessage(
      (msg: WebToExtMsg) => this._handleWebMessage(msg),
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

    this._watchFile();
    this._disposables.push(outputChannel);

    // Push updated dialect to WebView whenever the setting changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('markdown-er.ddl.dialect')) {
        this._send({ type: 'dialectChanged', payload: { dialect: this._getDialect() } });
      }
    }, null, this._disposables);
  }

  public async requestDdl(mode: 'full' | 'diff', baselineRef?: string) {
    await this._flushPendingSave();
    if (this._model) {
      await this._generateDdl(this._model, mode, baselineRef);
    }
  }

  private _getDialect(): DdlDialect {
    return vscode.workspace
      .getConfiguration('markdown-er')
      .get<DdlDialect>('ddl.dialect', 'mysql');
  }

  private async _changeFile(fileUri: vscode.Uri) {
    if (fileUri.toString() === this._fileUri.toString()) { return; }
    // Write edits of the current file before switching, so they don't land in the new one
    await this._flushPendingSave();
    this._fileUri = fileUri;
    this._model = undefined;
    this._lastWrittenText = undefined;
    this._panel.title = fileUri.path.split('/').pop() ?? 'ER Diagram';
    this._watchFile();
    await this._loadAndSend();
  }

  private _watchFile() {
    this._watcher?.dispose();
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.joinPath(this._fileUri, '..'),
        this._fileUri.path.split('/').pop()!
      )
    );
    const sub = watcher.onDidChange(() => this._onExternalFileChange());
    this._watcher = vscode.Disposable.from(sub, watcher);
  }

  private async _loadAndSend() {
    try {
      const bytes = await vscode.workspace.fs.readFile(this._fileUri);
      const text = Buffer.from(bytes).toString('utf-8');
      this._model = ErmdParser.parse(text);
      this._send({ type: 'load', payload: this._model, fileUri: this._fileUri.toString() });
      // Also send current dialect so WebView is in sync from the start
      this._send({ type: 'dialectChanged', payload: { dialect: this._getDialect() } });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to load ER diagram: ${err}`);
    }
  }

  private async _onExternalFileChange() {
    try {
      const bytes = await vscode.workspace.fs.readFile(this._fileUri);
      const text = Buffer.from(bytes).toString('utf-8');
      // Our own write (the watcher may fire more than once per write)
      if (text === this._lastWrittenText) { return; }
      // The external edit wins over edits not yet written
      this._cancelPendingSave();
      const model = ErmdParser.parse(text);
      this._model = model;
      this._send({ type: 'fileChanged', payload: model });
    } catch {
      // ignore read errors on external changes
    }
  }

  private _send(msg: ExtToWebMsg) {
    this._panel.webview.postMessage(msg);
  }

  private async _handleWebMessage(msg: WebToExtMsg) {
    switch (msg.type) {
      case 'ready':
        // A (re)loaded WebView starts counting save versions from 0 again
        await this._flushPendingSave();
        this._saveVersion = 0;
        await this._loadAndSend();
        break;

      case 'save': {
        if (msg.fileUri !== this._fileUri.toString()) {
          // Late save for a file the panel has already switched away from
          await this._writeFile(vscode.Uri.parse(msg.fileUri), msg.payload);
          break;
        }
        if (msg.version <= this._saveVersion) { return; }
        this._pendingSave = { model: msg.payload, version: msg.version };
        if (this._saveTimer) { clearTimeout(this._saveTimer); }
        this._saveTimer = setTimeout(() => this._flushPendingSave(), 500);
        break;
      }

      case 'requestDdl':
        await this._flushPendingSave();
        if (this._model) {
          await this._generateDdl(
            this._model,
            msg.payload.mode,
            msg.payload.baselineRef,
            {
              insertSeedData: msg.payload.insertSeedData,
              skipAutoIncrementPk: msg.payload.skipAutoIncrementPk,
              fromVersionId: msg.payload.fromVersionId,
              toVersionId: msg.payload.toVersionId,
            }
          );
        }
        break;

      case 'saveVersion': {
        const name = await vscode.window.showInputBox({
          prompt: 'バージョン名を入力してください',
          placeHolder: `v${((msg.payload.model.schemaVersions?.length ?? 0) + 1)}`,
          value: `v${((msg.payload.model.schemaVersions?.length ?? 0) + 1)}`,
        });
        if (name === undefined) { break; }
        await this._flushPendingSave();
        const newVersion: SchemaVersion = {
          id: `ver_${Date.now()}`,
          name,
          date: new Date().toISOString(),
          tables: JSON.parse(JSON.stringify(msg.payload.model.tables)),
          relations: JSON.parse(JSON.stringify(msg.payload.model.relations)),
          dictionary: JSON.parse(JSON.stringify(msg.payload.model.dictionary)),
          layout: JSON.parse(JSON.stringify(msg.payload.model.layout)),
        };
        const updatedModel: DiagramModel = {
          ...(this._model ?? msg.payload.model),
          schemaVersions: [...((this._model ?? msg.payload.model).schemaVersions ?? []), newVersion],
        };
        await this._writeToDiskImmediate(updatedModel);
        this._send({ type: 'versionSaved', payload: updatedModel });
        break;
      }

      case 'deleteVersion': {
        await this._flushPendingSave();
        if (!this._model) { break; }
        const updatedModel: DiagramModel = {
          ...this._model,
          schemaVersions: (this._model.schemaVersions ?? []).filter(
            (v) => v.id !== msg.payload.versionId
          ),
        };
        await this._writeToDiskImmediate(updatedModel);
        this._send({ type: 'versionSaved', payload: updatedModel });
        break;
      }

      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'markdown-er');
        break;
    }
  }

  private _cancelPendingSave() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = undefined;
    }
    this._pendingSave = undefined;
  }

  private async _flushPendingSave() {
    const pending = this._pendingSave;
    this._cancelPendingSave();
    if (!pending) { return; }
    this._saveVersion = pending.version;
    // Schema versions are owned by the extension host (saveVersion / deleteVersion),
    // so a WebView model that is stale or undone must not overwrite them.
    const schemaVersions = this._model ? this._model.schemaVersions : pending.model.schemaVersions;
    await this._writeToDiskImmediate({ ...pending.model, schemaVersions });
  }

  private async _writeToDiskImmediate(model: DiagramModel) {
    this._model = model;
    this._lastWrittenText = ErmdSerializer.serialize(model, this._fileUri);
    await this._writeFile(this._fileUri, model, this._lastWrittenText);
  }

  private async _writeFile(uri: vscode.Uri, model: DiagramModel, text = ErmdSerializer.serialize(model, uri)) {
    try {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf-8'));
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to save ER diagram: ${err}`);
    }
  }

  private async _generateDdl(
    model: DiagramModel,
    mode: 'full' | 'diff' | 'version-diff',
    baselineRef?: string,
    options: DdlOptions & { fromVersionId?: string; toVersionId?: string | null } = {}
  ) {
    const dialect = this._getDialect();
    let ddl: string;
    if (mode === 'full') {
      ddl = DdlExporter.export(model, dialect, options);
    } else if (mode === 'version-diff') {
      const versions = model.schemaVersions ?? [];
      const fromVer = versions.find((v) => v.id === options.fromVersionId);
      if (!fromVer) {
        ddl = '-- バージョンが見つかりません';
      } else {
        const toVer = options.toVersionId
          ? versions.find((v) => v.id === options.toVersionId)
          : undefined;
        const fromModel: DiagramModel = { ...model, tables: fromVer.tables, relations: fromVer.relations, dictionary: fromVer.dictionary };
        const toModel: DiagramModel = toVer
          ? { ...model, tables: toVer.tables, relations: toVer.relations, dictionary: toVer.dictionary }
          : model;
        ddl = DdlDiffer.diffModels(fromModel, toModel, dialect);
      }
    } else {
      ddl = await DdlDiffer.diff(model, this._fileUri, baselineRef ?? 'HEAD~1', dialect);
    }
    this._outputChannel.clear();
    this._outputChannel.appendLine(ddl);
    this._outputChannel.show();
    this._send({ type: 'ddlResult', payload: { ddl, mode } });
  }

  private _buildHtml(): string {
    const webview = this._panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'webview.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>ER Diagram</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private _dispose() {
    ErmdPanel.currentPanel = undefined;
    // Closing the panel right after an edit must not drop it
    void this._flushPendingSave();
    this._watcher?.dispose();
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
