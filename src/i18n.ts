import * as vscode from 'vscode';
import type { LanguageSetting, Locale } from '../shared/messages';

const en = {
  noFileOpen: 'No file is open. Please open an ER diagram file first.',
  noDiagramOpen: 'No ER diagram is open.',
  gitRefPrompt: 'Enter git ref for baseline (e.g. HEAD~1)',
  versionNamePrompt: 'Enter a version name',
  versionNotFound: '-- Version not found',
  loadFailed: (err: unknown) => `Failed to load ER diagram: ${err}`,
  saveFailed: (err: unknown) => `Failed to save ER diagram: ${err}`,
  saveDdlTitle: 'Save DDL',
  saveDataTitle: 'Save seed data (INSERT)',
  allFiles: 'All files',
  sqlSaved: (path: string) => `Saved ${path}`,
  sqlSaveFailed: (err: unknown) => `Failed to save SQL file: ${err}`,
  openFile: 'Open',
};

type ExtensionMessages = typeof en;

const ja: ExtensionMessages = {
  noFileOpen: 'ファイルが開かれていません。先に ER 図ファイルを開いてください。',
  noDiagramOpen: 'ER 図が開かれていません。',
  gitRefPrompt: '比較元の git ref を入力してください（例: HEAD~1）',
  versionNamePrompt: 'バージョン名を入力してください',
  versionNotFound: '-- バージョンが見つかりません',
  loadFailed: (err: unknown) => `ER 図を読み込めませんでした: ${err}`,
  saveFailed: (err: unknown) => `ER 図を保存できませんでした: ${err}`,
  saveDdlTitle: 'DDL を保存',
  saveDataTitle: '初期データ（INSERT）を保存',
  allFiles: 'すべてのファイル',
  sqlSaved: (path: string) => `${path} に保存しました`,
  sqlSaveFailed: (err: unknown) => `SQL ファイルを保存できませんでした: ${err}`,
  openFile: '開く',
};

export function languageSetting(): LanguageSetting {
  return vscode.workspace.getConfiguration('markdown-er').get<LanguageSetting>('language', 'auto');
}

/** `auto` follows the VSCode display language */
export function resolveLocale(setting: LanguageSetting = languageSetting()): Locale {
  if (setting !== 'auto') { return setting; }
  return vscode.env.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

/** Messages shown by the extension host (notifications, input boxes) */
export function t(): ExtensionMessages {
  return resolveLocale() === 'ja' ? ja : en;
}
