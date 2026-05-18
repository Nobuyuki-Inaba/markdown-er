import * as vscode from 'vscode';
import { ErmdParser } from './ErmdParser';
import { ErmdSerializer } from './ErmdSerializer';
import { DdlExporter } from './DdlExporter';
import { DdlDiffer } from './DdlDiffer';
import { DiagramModel } from '../shared/DiagramModel';
import { DdlDialect, ExtToWebMsg, WebToExtMsg } from '../shared/messages';

export class ErmdPanel {
  public static currentPanel: ErmdPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _fileUri: vscode.Uri;
  private _model: DiagramModel | undefined;
  private _saveVersion = 0;
  private _saveTimer: ReturnType<typeof setTimeout> | undefined;
  private _suppressNextFileChange = false;
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

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.joinPath(fileUri, '..'),
        fileUri.path.split('/').pop()!
      )
    );
    watcher.onDidChange(() => this._onExternalFileChange(), null, this._disposables);
    this._disposables.push(watcher);
    this._disposables.push(outputChannel);

    // Push updated dialect to WebView whenever the setting changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('markdown-er.ddl.dialect')) {
        this._send({ type: 'dialectChanged', payload: { dialect: this._getDialect() } });
      }
    }, null, this._disposables);
  }

  public requestDdl(mode: 'full' | 'diff', baselineRef?: string) {
    if (this._model) {
      this._generateDdl(this._model, mode, baselineRef);
    }
  }

  private _getDialect(): DdlDialect {
    return vscode.workspace
      .getConfiguration('markdown-er')
      .get<DdlDialect>('ddl.dialect', 'mysql');
  }

  private _changeFile(fileUri: vscode.Uri) {
    this._fileUri = fileUri;
    this._panel.title = fileUri.path.split('/').pop() ?? 'ER Diagram';
    this._loadAndSend();
  }

  private async _loadAndSend() {
    try {
      const bytes = await vscode.workspace.fs.readFile(this._fileUri);
      const text = Buffer.from(bytes).toString('utf-8');
      this._model = ErmdParser.parse(text);
      this._send({ type: 'load', payload: this._model });
      // Also send current dialect so WebView is in sync from the start
      this._send({ type: 'dialectChanged', payload: { dialect: this._getDialect() } });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to load ER diagram: ${err}`);
    }
  }

  private async _onExternalFileChange() {
    if (this._suppressNextFileChange) {
      this._suppressNextFileChange = false;
      return;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(this._fileUri);
      const text = Buffer.from(bytes).toString('utf-8');
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
        await this._loadAndSend();
        break;

      case 'save': {
        if (msg.version <= this._saveVersion) { return; }
        const pendingVersion = msg.version;
        const pendingModel = msg.payload;
        if (this._saveTimer) { clearTimeout(this._saveTimer); }
        this._saveTimer = setTimeout(
          () => this._writeToDisk(pendingModel, pendingVersion),
          500
        );
        break;
      }

      case 'requestDdl':
        if (this._model) {
          await this._generateDdl(this._model, msg.payload.mode, msg.payload.baselineRef);
        }
        break;

      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'markdown-er');
        break;
    }
  }

  private async _writeToDisk(model: DiagramModel, version: number) {
    this._saveTimer = undefined;
    this._saveVersion = version;
    this._model = model;
    const text = ErmdSerializer.serialize(model, this._fileUri);
    this._suppressNextFileChange = true;
    await vscode.workspace.fs.writeFile(this._fileUri, Buffer.from(text, 'utf-8'));
  }

  private async _generateDdl(model: DiagramModel, mode: 'full' | 'diff', baselineRef?: string) {
    const dialect = this._getDialect();
    let ddl: string;
    if (mode === 'full') {
      ddl = DdlExporter.export(model, dialect);
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
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = undefined;
    }
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
