import * as vscode from 'vscode';
import { ErmdPanel } from './ErmdPanel';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('markdown-er.openDiagram', (uri?: vscode.Uri) => {
      const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!fileUri) {
        vscode.window.showErrorMessage('No file is open. Please open an ER diagram Markdown file first.');
        return;
      }
      ErmdPanel.createOrShow(context, fileUri);
    }),

    vscode.commands.registerCommand('markdown-er.exportDdl', () => {
      if (!ErmdPanel.currentPanel) {
        vscode.window.showErrorMessage('No ER diagram is open.');
        return;
      }
      ErmdPanel.currentPanel.requestDdl('full');
    }),

    vscode.commands.registerCommand('markdown-er.exportDdlDiff', async () => {
      if (!ErmdPanel.currentPanel) {
        vscode.window.showErrorMessage('No ER diagram is open.');
        return;
      }
      const ref = await vscode.window.showInputBox({
        prompt: 'Enter git ref for baseline (e.g. HEAD~1)',
        value: 'HEAD~1',
      });
      if (ref !== undefined) {
        ErmdPanel.currentPanel.requestDdl('diff', ref);
      }
    })
  );
}

export function deactivate() {}
