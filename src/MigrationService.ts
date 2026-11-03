import * as vscode from 'vscode';
import { fileName, markdownDocsOptions, readText, readTexts, versionsUri } from './ErmdFiles';
import { decode } from './format/ErmdCodec';
import { CURRENT_FORMAT_VERSION, NewerFormatError, formatStatus } from './format/formatVersion';
import { MigrationPlan, planMigration } from './format/migrations';
import { resolveLocale, t } from './i18n';

const DISMISSED_KEY = 'markdown-er.migration.dismissed';
const SCHEME = 'markdown-er-migrated';

/**
 * Updates old .ermd files to the current format, only when the user agrees:
 * a prompt when a diagram is opened, and the Migrate commands. Never updates on its own.
 */
export class MigrationService {
  /** Proposed texts shown in the diff view, by the proposal's URI */
  private readonly _proposed = new Map<string, string>();
  private readonly _changed = new vscode.EventEmitter<vscode.Uri>();
  /** Files already asked about in this session */
  private readonly _asked = new Set<string>();

  constructor(
    private readonly _context: vscode.ExtensionContext,
    /** Writes edits still pending for the file, so the migration starts from what is on screen */
    private readonly _flush: (uri: vscode.Uri) => Promise<void>,
  ) {
    _context.subscriptions.push(
      this._changed,
      vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
        onDidChange: this._changed.event,
        provideTextDocumentContent: (uri) => this._proposed.get(uri.toString()) ?? '',
      }),
    );
  }

  /** Asks once per session whether to update an old file, unless turned off */
  async promptOnOpen(uri: vscode.Uri) {
    const key = uri.toString();
    const setting = vscode.workspace.getConfiguration('markdown-er.migration').get<string>('prompt', 'ask');
    if (setting === 'never' || this._asked.has(key) || this._dismissed().includes(key)) { return; }
    this._asked.add(key);
    const plan = await this._plan(uri).catch(() => null);
    if (plan) { await this._ask(uri, plan, true); }
  }

  /** Command: update one file (from the explorer, the open diagram or the active editor) */
  async migrateFile(uri: vscode.Uri) {
    let plan: MigrationPlan | null;
    try {
      plan = await this._plan(uri);
    } catch (err) {
      this._showPlanError(uri, err);
      return;
    }
    if (!plan) {
      vscode.window.showInformationMessage(t().migrateCurrent(fileName(uri), CURRENT_FORMAT_VERSION));
      return;
    }
    await this._ask(uri, plan, false);
  }

  /** Command: pick old files in the workspace and update them */
  async migrateWorkspace() {
    const uris = await vscode.workspace.findFiles('**/*.ermd', '**/node_modules/**');
    const items: (vscode.QuickPickItem & { uri: vscode.Uri })[] = [];
    for (const uri of uris) {
      try {
        const { version } = decode(await readTexts(uri));
        if (formatStatus(version) === 'old') {
          items.push({
            label: vscode.workspace.asRelativePath(uri),
            description: `v${version} → v${CURRENT_FORMAT_VERSION}`,
            picked: true,
            uri,
          });
        }
      } catch {
        // unreadable files are left alone
      }
    }
    if (items.length === 0) {
      vscode.window.showInformationMessage(t().migrateNoOldFiles);
      return;
    }
    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title: t().migratePickTitle,
      placeHolder: t().migratePickPlaceholder,
    });
    if (!picked?.length) { return; }
    let done = 0;
    for (const item of picked) {
      if (await this._apply(item.uri, true)) { done++; }
    }
    vscode.window.showInformationMessage(t().migrateCount(done, picked.length));
  }

  private _dismissed(): string[] {
    return this._context.workspaceState.get<string[]>(DISMISSED_KEY, []);
  }

  private async _plan(uri: vscode.Uri): Promise<MigrationPlan | null> {
    return planMigration(await readTexts(uri), { fileName: fileName(uri), docs: markdownDocsOptions() });
  }

  private _showPlanError(uri: vscode.Uri, err: unknown) {
    if (err instanceof NewerFormatError) {
      vscode.window.showWarningMessage(t().newerFormat(fileName(uri), err.version, CURRENT_FORMAT_VERSION));
    } else {
      vscode.window.showErrorMessage(t().migrateFailed(fileName(uri), err));
    }
  }

  private async _ask(uri: vscode.Uri, plan: MigrationPlan, onOpen: boolean) {
    const m = t();
    const name = fileName(uri);
    const steps = plan.applied.map((step) => step.describe(resolveLocale())).join(' ');
    const buttons = onOpen
      ? [m.migrateUpdate, m.migrateShowChanges, m.migrateNotNow, m.migrateDontAsk]
      : [m.migrateUpdate, m.migrateShowChanges];
    for (;;) {
      const question = m.migratePrompt(name, plan.from, plan.to);
      const choice = onOpen
        // A notification shows no detail: put everything in the message
        ? await vscode.window.showInformationMessage(`${question} ${steps} ${m.migrateTeamNote}`, ...buttons)
        : await vscode.window.showInformationMessage(question, { modal: true, detail: `${steps}\n\n${m.migrateTeamNote}` }, ...buttons);
      if (choice === m.migrateUpdate) {
        await this._apply(uri, false);
        return;
      }
      if (choice === m.migrateShowChanges) {
        await this._showDiff(uri, plan);
        continue;
      }
      if (choice === m.migrateDontAsk) {
        await this._context.workspaceState.update(DISMISSED_KEY, [...this._dismissed(), uri.toString()]);
      }
      return;
    }
  }

  private async _showDiff(uri: vscode.Uri, plan: MigrationPlan) {
    const proposed = vscode.Uri.from({ scheme: SCHEME, path: uri.path, query: uri.toString() });
    this._proposed.set(proposed.toString(), plan.texts.main);
    this._changed.fire(proposed);
    await vscode.commands.executeCommand('vscode.diff', uri, proposed, t().migrateDiffTitle(fileName(uri), plan.from, plan.to));
  }

  /**
   * Rewrite the file as one workspace edit (Ctrl+Z in the editor undoes it) and save it.
   * Planned again from the current text, so nothing written since the prompt is lost.
   */
  private async _apply(uri: vscode.Uri, quiet: boolean): Promise<boolean> {
    const name = fileName(uri);
    try {
      await this._flush(uri);
      const doc = await vscode.workspace.openTextDocument(uri);
      if (doc.isDirty) {
        vscode.window.showWarningMessage(t().migrateDirty(name));
        return false;
      }
      const plan = planMigration(
        { main: doc.getText(), versions: await readText(versionsUri(uri)) },
        { fileName: name, docs: markdownDocsOptions() },
      );
      if (!plan) { return true; }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), plan.texts.main);
      if (typeof plan.texts.versions === 'string') {
        edit.createFile(versionsUri(uri), { overwrite: true, contents: Buffer.from(plan.texts.versions, 'utf-8') });
      }
      if (!await vscode.workspace.applyEdit(edit)) {
        throw new Error('the workspace edit was rejected');
      }
      await doc.save();
      if (!quiet) { vscode.window.showInformationMessage(t().migrateDone(name, plan.to)); }
      return true;
    } catch (err) {
      this._showPlanError(uri, err);
      return false;
    }
  }
}
