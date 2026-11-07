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
  testFileUnreadable: (name: string) => `${name} could not be read, so test tables and test data are not shown. It will not be changed until it is fixed.`,
  saveDdlTitle: 'Save DDL',
  saveDataTitle: 'Save seed data (INSERT)',
  allFiles: 'All files',
  sqlSaved: (path: string) => `Saved ${path}`,
  sqlSaveFailed: (err: unknown) => `Failed to save SQL file: ${err}`,
  openFile: 'Open',
  newerFormat: (name: string, version: number, supported: number) =>
    `${name} uses file format v${version}, but this version of Markdown ER Diagram supports up to v${supported}. ` +
    'It is opened read-only: update the extension to edit it.',
  readOnly: 'This file is read-only (its format is newer than this extension). Changes are not saved.',
  migratePrompt: (name: string, from: number, to: number) =>
    `${name} uses an older file format (v${from}). Update it to the current format (v${to})?`,
  migrateTeamNote: 'Anyone editing this file with an older version of the extension should update it first.',
  migrateUpdate: 'Update',
  migrateShowChanges: 'Show changes',
  migrateNotNow: 'Not now',
  migrateDontAsk: "Don't ask for this file",
  migrateDiffTitle: (name: string, from: number, to: number) => `${name}: v${from} ↔ v${to} (proposed)`,
  migrateDone: (name: string, to: number) => `Updated ${name} to file format v${to}.`,
  migrateDirty: (name: string) => `${name} has unsaved changes. Save it, then update the format.`,
  migrateFailed: (name: string, err: unknown) => `Could not update ${name}: ${err}`,
  migrateCurrent: (name: string, version: number) => `${name} already uses the current file format (v${version}).`,
  migrateNoOldFiles: 'Every ER diagram in the workspace uses the current file format.',
  migratePickTitle: 'Update file format',
  migratePickPlaceholder: 'Files to update to the current format',
  migrateCount: (done: number, total: number) => `Updated ${done} of ${total} files to the current file format.`,
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
  testFileUnreadable: (name: string) => `${name} を読み取れないため、テスト用のテーブルとデータを表示できません。修正するまでこのファイルは変更しません。`,
  saveDdlTitle: 'DDL を保存',
  saveDataTitle: '初期データ（INSERT）を保存',
  allFiles: 'すべてのファイル',
  sqlSaved: (path: string) => `${path} に保存しました`,
  sqlSaveFailed: (err: unknown) => `SQL ファイルを保存できませんでした: ${err}`,
  openFile: '開く',
  newerFormat: (name: string, version: number, supported: number) =>
    `${name} はファイル形式 v${version} ですが、この Markdown ER Diagram が対応しているのは v${supported} までです。` +
    '読み取り専用で開きました。編集するには拡張機能を更新してください。',
  readOnly: 'このファイルは読み取り専用です（拡張機能より新しい形式のため）。変更は保存されません。',
  migratePrompt: (name: string, from: number, to: number) =>
    `${name} は古いファイル形式（v${from}）です。最新の形式（v${to}）に更新しますか？`,
  migrateTeamNote: '古い拡張機能でこのファイルを編集している人がいる場合は、先に拡張機能を更新してもらってください。',
  migrateUpdate: '更新する',
  migrateShowChanges: '変更内容を見る',
  migrateNotNow: '今回はしない',
  migrateDontAsk: 'このファイルでは今後表示しない',
  migrateDiffTitle: (name: string, from: number, to: number) => `${name}: v${from} ↔ v${to}（更新後）`,
  migrateDone: (name: string, to: number) => `${name} をファイル形式 v${to} に更新しました。`,
  migrateDirty: (name: string) => `${name} に保存されていない変更があります。保存してから形式を更新してください。`,
  migrateFailed: (name: string, err: unknown) => `${name} を更新できませんでした: ${err}`,
  migrateCurrent: (name: string, version: number) => `${name} はすでに最新のファイル形式（v${version}）です。`,
  migrateNoOldFiles: 'ワークスペースの ER 図はすべて最新のファイル形式です。',
  migratePickTitle: 'ファイル形式を更新',
  migratePickPlaceholder: '最新の形式に更新するファイル',
  migrateCount: (done: number, total: number) => `${total} 件中 ${done} 件のファイルを最新の形式に更新しました。`,
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
