import * as vscode from 'vscode';
import { ErmdPanel } from './ErmdPanel';
import { t } from './i18n';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('markdown-er.openDiagram', (uri?: vscode.Uri) => {
      const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!fileUri) {
        vscode.window.showErrorMessage(t().noFileOpen);
        return;
      }
      ErmdPanel.createOrShow(context, fileUri);
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
    })
  );
}

export function deactivate() {}
