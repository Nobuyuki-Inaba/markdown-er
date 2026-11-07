import { applyDdlReplacements } from '../shared/ddlReplacements';
import * as vscode from 'vscode';
import { fileName, readDiagram, writeDiagram } from './ErmdFiles';
import { ErmdTexts, isTestFileReadable, testFileName, versionsFileName } from './format/ErmdCodec';
import { CURRENT_FORMAT_VERSION, formatStatus } from './format/formatVersion';
import { MigrationService } from './MigrationService';
import { DdlExporter, DdlOptions, SchemaDiffer } from './ddl';
import { loadGitBaseline } from './GitBaseline';
import { languageSetting, resolveLocale, t } from './i18n';
import { DiagramModel, SchemaVersion } from '../shared/DiagramModel';
import { DdlDialect, DdlMode, ExtToWebMsg, SqlFileKind, WebToExtMsg } from '../shared/messages';
import { DdlStyle, DEFAULT_DDL_STYLE, DDL_STYLE_KEYS } from '../shared/ddlStyle';
import { productionModel } from '../shared/testData';
import { validateModel } from '../shared/validation';

/** The setting and default of each file `Save…` offers */
const SQL_FILES: Record<SqlFileKind, { setting: string; fallback: string }> = {
  ddl:      { setting: 'outputFile',         fallback: '${fileBasenameNoExtension}.sql' },
  data:     { setting: 'dataOutputFile',     fallback: '${fileBasenameNoExtension}_data.sql' },
  testDdl:  { setting: 'testOutputFile',     fallback: '${fileBasenameNoExtension}_test.sql' },
  testData: { setting: 'testDataOutputFile', fallback: '${fileBasenameNoExtension}_test_data.sql' },
};

export class ErmdPanel {
  public static currentPanel: ErmdPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _fileUri: vscode.Uri;
  private _model: DiagramModel | undefined;
  /** The file's format is newer than this extension: nothing is written */
  private _readOnly = false;
  private _saveVersion = 0;
  private _saveTimer: ReturnType<typeof setTimeout> | undefined;
  private _pendingSave: { model: DiagramModel; version: number } | undefined;
  // Texts of our own last write (.ermd and versions file), so the file watcher can ignore it
  private _lastWrittenText: string | undefined;
  private _lastWrittenVersions: string | undefined;
  private _lastWrittenTest: string | undefined;
  // Our write of the two files is in progress: one may be written and the other not yet
  private _writing = false;
  private _watcher: vscode.Disposable | undefined;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _outputChannel: vscode.OutputChannel;
  // Last file chosen per diagram + kind, offered again in the save dialog
  private readonly _lastSqlFile = new Map<string, vscode.Uri>();

  public static createOrShow(context: vscode.ExtensionContext, fileUri: vscode.Uri, migrations: MigrationService) {
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
      vscode.window.createOutputChannel('ER Diagram DDL'),
      migrations
    );
  }

  public get fileUri(): vscode.Uri {
    return this._fileUri;
  }

  /** Write edits still waiting for the debounce, if they are for `uri` */
  public async flushPendingSaveFor(uri: vscode.Uri) {
    if (uri.toString() === this._fileUri.toString()) {
      await this._flushPendingSave();
    }
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    fileUri: vscode.Uri,
    outputChannel: vscode.OutputChannel,
    private readonly _migrations: MigrationService
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

    // Push updated dialect / DDL style / language to WebView whenever the settings change
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('markdown-er.ddl.dialect')) {
        this._send({ type: 'dialectChanged', payload: { dialect: this._getDialect() } });
      }
      if (DDL_STYLE_KEYS.some((key) => e.affectsConfiguration(`markdown-er.ddl.${key}`))) {
        this._send({ type: 'ddlStyleChanged', payload: this._getDdlStyle() });
      }
      if (e.affectsConfiguration('markdown-er.language')) {
        this._sendLocale();
      }
    }, null, this._disposables);
  }

  private _sendLocale() {
    const setting = languageSetting();
    this._send({ type: 'localeChanged', payload: { locale: resolveLocale(setting), setting } });
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

  /** `markdown-er.ddl.<key>` settings */
  private _getDdlStyle(): DdlStyle {
    const config = vscode.workspace.getConfiguration('markdown-er.ddl');
    const style = { ...DEFAULT_DDL_STYLE };
    for (const key of DDL_STYLE_KEYS) {
      style[key] = config.get<boolean>(key, DEFAULT_DDL_STYLE[key]);
    }
    return style;
  }

  private async _changeFile(fileUri: vscode.Uri) {
    if (fileUri.toString() === this._fileUri.toString()) { return; }
    // Write edits of the current file before switching, so they don't land in the new one
    await this._flushPendingSave();
    this._fileUri = fileUri;
    this._model = undefined;
    this._lastWrittenText = undefined;
    this._lastWrittenVersions = undefined;
    this._lastWrittenTest = undefined;
    this._panel.title = fileName(fileUri);
    this._watchFile();
    await this._loadAndSend();
  }

  /** Watches the .ermd file, its schema versions file and its test file */
  private _watchFile() {
    this._watcher?.dispose();
    const name = fileName(this._fileUri);
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.joinPath(this._fileUri, '..'),
        `{${name},${versionsFileName(name)},${testFileName(name)}}`
      )
    );
    const onChange = () => this._onExternalFileChange();
    this._watcher = vscode.Disposable.from(
      watcher.onDidChange(onChange), watcher.onDidCreate(onChange), watcher.onDidDelete(onChange), watcher
    );
  }

  private async _loadAndSend() {
    try {
      const { model, texts } = await readDiagram(this._fileUri);
      this._model = model;
      if (!isTestFileReadable(texts.test)) {
        vscode.window.showWarningMessage(t().testFileUnreadable(testFileName(fileName(this._fileUri))));
      }
      this._send({ type: 'load', payload: this._model, fileUri: this._fileUri.toString() });
      this._updateFormatStatus(model);
      // Also send current dialect so WebView is in sync from the start
      this._send({ type: 'dialectChanged', payload: { dialect: this._getDialect() } });
      this._sendLocale();
      this._send({ type: 'ddlStyleChanged', payload: this._getDdlStyle() });
      const status = formatStatus(model.version);
      if (status === 'newer') {
        vscode.window.showWarningMessage(t().newerFormat(fileName(this._fileUri), model.version, CURRENT_FORMAT_VERSION));
      } else if (status === 'old') {
        void this._migrations.promptOnOpen(this._fileUri);
      }
    } catch (err) {
      vscode.window.showErrorMessage(t().loadFailed(err));
    }
  }

  private _updateFormatStatus(model: DiagramModel) {
    this._readOnly = formatStatus(model.version) === 'newer';
    this._send({
      type: 'fileStatus',
      payload: { readOnly: this._readOnly, formatVersion: model.version, supportedVersion: CURRENT_FORMAT_VERSION },
    });
  }

  private async _onExternalFileChange() {
    if (this._writing) { return; }
    try {
      const { model, texts } = await readDiagram(this._fileUri);
      if (texts.main === undefined || this._writing) { return; }
      // Our own write (the watcher may fire more than once per write)
      if (texts.main === this._lastWrittenText && texts.versions === this._lastWrittenVersions && texts.test === this._lastWrittenTest) { return; }
      // The external edit wins over edits not yet written
      this._cancelPendingSave();
      this._model = model;
      this._send({ type: 'fileChanged', payload: model });
      this._updateFormatStatus(model);
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
        if (msg.version < this._saveVersion || (msg.version === this._saveVersion && !msg.immediate)) { return; }
        this._pendingSave = { model: msg.payload, version: msg.version };
        if (msg.immediate) {
          await this._flushPendingSave();
          break;
        }
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
              includeCreateDatabase: msg.payload.includeCreateDatabase,
              fromVersionId: msg.payload.fromVersionId,
              toVersionId: msg.payload.toVersionId,
            }
          );
        }
        break;

      case 'saveVersion': {
        if (this._readOnly) {
          vscode.window.showWarningMessage(t().readOnly);
          break;
        }
        const name = await vscode.window.showInputBox({
          prompt: t().versionNamePrompt,
          placeHolder: `v${((msg.payload.model.schemaVersions?.length ?? 0) + 1)}`,
          value: `v${((msg.payload.model.schemaVersions?.length ?? 0) + 1)}`,
        });
        if (name === undefined) { break; }
        await this._flushPendingSave();
        // A version is a snapshot of the production schema
        const snapshot = productionModel(msg.payload.model);
        const newVersion: SchemaVersion = {
          id: `ver_${Date.now()}`,
          name,
          date: new Date().toISOString(),
          tables: JSON.parse(JSON.stringify(snapshot.tables)),
          relations: JSON.parse(JSON.stringify(snapshot.relations)),
          dictionary: JSON.parse(JSON.stringify(snapshot.dictionary)),
          layout: JSON.parse(JSON.stringify(snapshot.layout)),
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
        if (this._readOnly) {
          vscode.window.showWarningMessage(t().readOnly);
          break;
        }
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

      case 'setLanguage':
        // The setting is the single source of truth; the change event re-sends localeChanged
        await vscode.workspace.getConfiguration('markdown-er')
          .update('language', msg.payload.setting, vscode.ConfigurationTarget.Global);
        break;

      case 'setDdlStyle': {
        // Same pattern: write the settings; the change event re-sends ddlStyleChanged
        const config = vscode.workspace.getConfiguration('markdown-er.ddl');
        for (const key of DDL_STYLE_KEYS) {
          const value = msg.payload[key];
          if (value !== undefined) { await config.update(key, value, vscode.ConfigurationTarget.Global); }
        }
        break;
      }

      case 'saveSqlFile':
        await this._saveSqlFile(msg.payload.kind, msg.payload.text);
        break;

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
    // Schema versions and the format version are owned by the extension host (saveVersion /
    // deleteVersion, migration), so a WebView model that is stale or undone must not overwrite them.
    const schemaVersions = this._model ? this._model.schemaVersions : pending.model.schemaVersions;
    const version = this._model ? this._model.version : pending.model.version;
    const ok = await this._writeToDiskImmediate({ ...pending.model, schemaVersions, version });
    // The panel may have been closed during the write (dispose flushes)
    if (ErmdPanel.currentPanel === this) {
      this._send({ type: 'saveStatus', payload: { version: pending.version, ok } });
    }
  }

  /** False if the write failed */
  private async _writeToDiskImmediate(model: DiagramModel): Promise<boolean> {
    if (this._readOnly) { return true; }
    this._model = model;
    this._writing = true;
    try {
      return await this._writeFile(this._fileUri, model, (onDisk) => {
        this._lastWrittenText = onDisk.main;
        this._lastWrittenVersions = onDisk.versions;
        this._lastWrittenTest = onDisk.test;
      });
    } finally {
      this._writing = false;
    }
  }

  private async _writeFile(uri: vscode.Uri, model: DiagramModel, beforeWrite?: (onDisk: ErmdTexts) => void): Promise<boolean> {
    try {
      await writeDiagram(uri, model, beforeWrite);
      return true;
    } catch (err) {
      vscode.window.showErrorMessage(t().saveFailed(err));
      return false;
    }
  }

  private async _generateDdl(
    model: DiagramModel,
    mode: DdlMode,
    baselineRef?: string,
    options: DdlOptions & { fromVersionId?: string; toVersionId?: string | null } = {}
  ) {
    const dialect = this._getDialect();
    const style = this._getDdlStyle();
    const toVer = mode === 'version-diff' && options.toVersionId
      ? model.schemaVersions?.find((v) => v.id === options.toVersionId)
      : undefined;
    const toModel: DiagramModel = toVer
      ? { ...model, tables: toVer.tables, relations: toVer.relations, dictionary: toVer.dictionary }
      : model;
    // Test DDL runs on top of production, so it needs both to be right
    const errors = validateModel(mode === 'test' ? toModel : productionModel(toModel));
    if (errors.length > 0) {
      this._send({ type: 'ddlResult', payload: { ddl: '', mode, errors } });
      return;
    }
    let ddl: string;
    let data: string | undefined;
    if (mode === 'full') {
      ddl = DdlExporter.export(model, dialect, { ...options, ...style });
      data = DdlExporter.exportData(model, dialect, { ...options, ...style });
    } else if (mode === 'test') {
      ddl = DdlExporter.exportTest(model, dialect, { ...options, ...style });
      data = DdlExporter.exportTestData(model, dialect, { ...options, ...style });
    } else if (mode === 'version-diff') {
      const versions = model.schemaVersions ?? [];
      const fromVer = versions.find((v) => v.id === options.fromVersionId);
      if (!fromVer) {
        ddl = t().versionNotFound;
      } else {
        const fromModel: DiagramModel = { ...model, tables: fromVer.tables, relations: fromVer.relations, dictionary: fromVer.dictionary };
        ddl = SchemaDiffer.diff(fromModel, toModel, dialect, style);
      }
    } else {
      const ref = baselineRef ?? 'HEAD~1';
      try {
        const baseline = await loadGitBaseline(this._fileUri, ref);
        ddl = SchemaDiffer.diff(baseline, model, dialect, style);
      } catch (err) {
        ddl = `-- Could not load baseline (${ref}): ${err instanceof Error ? err.message : err}\n` +
          `-- Falling back to full DDL\n\n${DdlExporter.export(model, dialect, style)}`;
      }
    }
    // The diagram's own find / replace rules, for whatever the generator doesn't cover
    ddl = applyDdlReplacements(ddl, model.ddlReplacements, dialect);
    data = data && applyDdlReplacements(data, model.ddlReplacements, dialect);
    this._outputChannel.clear();
    this._outputChannel.appendLine(ddl);
    this._outputChannel.show();
    this._send({ type: 'ddlResult', payload: { ddl, data, mode } });
  }

  /**
   * Save dialog preset with the last file chosen for this diagram, else the
   * `markdown-er.ddl.outputFile` / `dataOutputFile` setting (relative to the diagram's folder).
   */
  private async _saveSqlFile(kind: SqlFileKind, text: string) {
    const key = `${this._fileUri.toString()}#${kind}`;
    const defaultUri = this._lastSqlFile.get(key) ?? this._defaultSqlFile(kind);
    const uri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { SQL: ['sql'], [t().allFiles]: ['*'] },
      title: kind === 'ddl' || kind === 'testDdl' ? t().saveDdlTitle : t().saveDataTitle,
    });
    if (!uri) { return; }
    try {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(text.endsWith('\n') ? text : `${text}\n`, 'utf-8'));
    } catch (err) {
      vscode.window.showErrorMessage(t().sqlSaveFailed(err));
      return;
    }
    this._lastSqlFile.set(key, uri);
    const open = t().openFile;
    if (await vscode.window.showInformationMessage(t().sqlSaved(vscode.workspace.asRelativePath(uri)), open) === open) {
      await vscode.window.showTextDocument(uri);
    }
  }

  private _defaultSqlFile(kind: SqlFileKind): vscode.Uri {
    const { setting, fallback } = SQL_FILES[kind];
    const pattern = vscode.workspace.getConfiguration('markdown-er.ddl').get<string>(setting, fallback) || fallback;
    const fileName = this._fileUri.path.split('/').pop() ?? 'diagram.ermd';
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(this._fileUri)?.uri.fsPath ?? '';
    const resolved = pattern
      .replace(/\$\{fileBasenameNoExtension\}/g, fileName.replace(/\.[^.]*$/, ''))
      .replace(/\$\{fileBasename\}/g, fileName)
      .replace(/\$\{workspaceFolder\}/g, workspaceFolder);
    const isAbsolute = /^([a-zA-Z]:)?[\\/]/.test(resolved);
    return isAbsolute
      ? vscode.Uri.file(resolved)
      : vscode.Uri.joinPath(this._fileUri, '..', ...resolved.split(/[\\/]/));
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
