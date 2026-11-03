import * as vscode from 'vscode';
import { ErmdPanel } from './ErmdPanel';
import { MigrationService } from './MigrationService';
import { t } from './i18n';

export function activate(context: vscode.ExtensionContext) {
  const migrations = new MigrationService(
    context,
    (uri) => ErmdPanel.currentPanel?.flushPendingSaveFor(uri) ?? Promise.resolve(),
  );

  /** The file a command applies to: the clicked file, else the open diagram, else the active editor */
  const targetFile = (uri?: vscode.Uri) =>
    uri ?? ErmdPanel.currentPanel?.fileUri ?? vscode.window.activeTextEditor?.document.uri;

  context.subscriptions.push(
    vscode.commands.registerCommand('markdown-er.openDiagram', (uri?: vscode.Uri) => {
      const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!fileUri) {
        vscode.window.showErrorMessage(t().noFileOpen);
        return;
      }
      ErmdPanel.createOrShow(context, fileUri, migrations);
    }),

    vscode.commands.registerCommand('markdown-er.exportDdl', () => {
      if (!ErmdPanel.currentPanel) {
        vscode.window.showErrorMessage(t().noDiagramOpen);
        return;
      }
      ErmdPanel.currentPanel.requestDdl('full');
    }),

    vscode.commands.registerCommand('markdown-er.exportDdlDiff', async () => {
      if (!ErmdPanel.currentPanel) {
        vscode.window.showErrorMessage(t().noDiagramOpen);
        return;
      }
      const ref = await vscode.window.showInputBox({
        prompt: t().gitRefPrompt,
        value: 'HEAD~1',
      });
      if (ref !== undefined) {
        ErmdPanel.currentPanel.requestDdl('diff', ref);
      }
    }),

    vscode.commands.registerCommand('markdown-er.migrateFile', (uri?: vscode.Uri) => {
      const fileUri = targetFile(uri);
      if (!fileUri) {
        vscode.window.showErrorMessage(t().noFileOpen);
        return;
      }
      return migrations.migrateFile(fileUri);
    }),

    vscode.commands.registerCommand('markdown-er.migrateWorkspace', () => migrations.migrateWorkspace())
  );
}

export function deactivate() {}
