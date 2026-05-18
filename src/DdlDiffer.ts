import * as vscode from 'vscode';
import * as cp from 'child_process';
import { DiagramModel, Table, Column, DictionaryEntry } from '../shared/DiagramModel';
import { ErmdParser } from './ErmdParser';
import { DdlExporter } from './DdlExporter';

export class DdlDiffer {
  static async diff(
    current: DiagramModel,
    fileUri: vscode.Uri,
    baselineRef: string
  ): Promise<string> {
    let baseline: DiagramModel;
    try {
      baseline = await getBaselineModel(fileUri, baselineRef);
    } catch (err) {
      return `-- Could not load baseline (${baselineRef}): ${err}\n-- Falling back to full DDL\n\n${DdlExporter.export(current)}`;
    }

    return generateAlterStatements(baseline, current);
  }
}

async function getBaselineModel(fileUri: vscode.Uri, ref: string): Promise<DiagramModel> {
  const relPath = vscode.workspace.asRelativePath(fileUri);
  return new Promise((resolve, reject) => {
    cp.exec(
      `git show ${ref}:"${relPath}"`,
      { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath },
      (err, stdout) => {
        if (err) return reject(err.message);
        resolve(ErmdParser.parse(stdout));
      }
    );
  });
}

function generateAlterStatements(baseline: DiagramModel, current: DiagramModel): string {
  const dict = new Map<string, DictionaryEntry>(
    current.dictionary.map((e) => [e.id, e])
  );
  const baseDict = new Map<string, DictionaryEntry>(
    baseline.dictionary.map((e) => [e.id, e])
  );

  const stmts: string[] = [];

  const baseTables = new Map(baseline.tables.map((t) => [t.id, t]));
  const curTables  = new Map(current.tables.map((t) => [t.id, t]));

  // DROP FK constraints for relations being removed
  for (const rel of baseline.relations) {
    if (!rel.hasForeignKey || !rel.constraintName) continue;
    if (!current.relations.find((r) => r.id === rel.id)) {
      const toTable = baseTables.get(rel.toTableId);
      if (toTable) {
        stmts.push(`ALTER TABLE \`${toTable.physicalName}\` DROP FOREIGN KEY \`${rel.constraintName}\`;`);
      }
    }
  }

  // Dropped tables
  for (const bt of baseTables.values()) {
    if (!curTables.has(bt.id)) {
      stmts.push(`DROP TABLE IF EXISTS \`${bt.physicalName}\`;`);
    }
  }

  // Renamed tables
  for (const ct of curTables.values()) {
    const bt = baseTables.get(ct.id);
    if (bt && bt.physicalName !== ct.physicalName) {
      stmts.push(`RENAME TABLE \`${bt.physicalName}\` TO \`${ct.physicalName}\`;`);
    }
  }

  // Column-level diffs
  for (const ct of curTables.values()) {
    const bt = baseTables.get(ct.id);
    if (!bt) continue; // new table handled below

    const baseColMap = new Map(bt.columns.map((c) => [c.id, c]));
    const curColMap  = new Map(ct.columns.map((c) => [c.id, c]));

    // Dropped columns
    for (const bc of baseColMap.values()) {
      if (!curColMap.has(bc.id)) {
        stmts.push(`ALTER TABLE \`${ct.physicalName}\` DROP COLUMN \`${bc.physicalName}\`;`);
      }
    }

    // Added columns
    for (const cc of curColMap.values()) {
      if (!baseColMap.has(cc.id)) {
        stmts.push(`ALTER TABLE \`${ct.physicalName}\` ADD COLUMN ${colDefinition(cc, dict)};`);
      }
    }

    // Modified columns
    for (const cc of curColMap.values()) {
      const bc = baseColMap.get(cc.id);
      if (!bc) continue;
      if (columnChanged(bc, cc, baseDict, dict)) {
        stmts.push(`ALTER TABLE \`${ct.physicalName}\` MODIFY COLUMN ${colDefinition(cc, dict)};`);
      }
    }
  }

  // New tables
  for (const ct of curTables.values()) {
    if (!baseTables.has(ct.id)) {
      stmts.push(DdlExporter.export({ ...current, tables: [ct], relations: [] }));
    }
  }

  // New FK constraints
  for (const rel of current.relations) {
    if (!rel.hasForeignKey || !rel.constraintName) continue;
    if (!baseline.relations.find((r) => r.id === rel.id)) {
      const fromTable = curTables.get(rel.fromTableId);
      const toTable   = curTables.get(rel.toTableId);
      const fromCol   = fromTable?.columns.find((c) => c.id === rel.fromColumnId);
      const toCol     = toTable?.columns.find((c) => c.id === rel.toColumnId);
      if (fromTable && toTable && fromCol && toCol) {
        stmts.push(
          `ALTER TABLE \`${toTable.physicalName}\`\n` +
          `  ADD CONSTRAINT \`${rel.constraintName}\`\n` +
          `  FOREIGN KEY (\`${toCol.physicalName}\`)\n` +
          `  REFERENCES \`${fromTable.physicalName}\` (\`${fromCol.physicalName}\`);`
        );
      }
    }
  }

  if (stmts.length === 0) {
    return '-- No changes detected';
  }

  return stmts.join('\n\n');
}

function colDefinition(col: Column, dict: Map<string, DictionaryEntry>): string {
  const entry = dict.get(col.dictionaryId);
  const typePart = entry
    ? entry.length !== null ? `${entry.dbType}(${entry.length})` : entry.dbType
    : 'VARCHAR(255)';
  const nullPart = col.isNullable ? 'NULL' : 'NOT NULL';
  const defaultPart = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : '';
  return `\`${col.physicalName}\` ${typePart} ${nullPart}${defaultPart}`;
}

function columnChanged(
  bc: Column, cc: Column,
  baseDict: Map<string, DictionaryEntry>,
  curDict: Map<string, DictionaryEntry>
): boolean {
  if (bc.physicalName !== cc.physicalName) return true;
  if (bc.isNullable   !== cc.isNullable)   return true;
  if (bc.defaultValue !== cc.defaultValue) return true;
  const bd = baseDict.get(bc.dictionaryId);
  const cd = curDict.get(cc.dictionaryId);
  if (bd?.dbType !== cd?.dbType || bd?.length !== cd?.length) return true;
  return false;
}
