import * as yaml from 'js-yaml';
import {
  DiagramModel, DictionaryEntry, Table, Column, ColumnSet, Relation,
  TableLayout, RegionLayout, SchemaVersion, DatabaseSettings, createEmptyModel,
} from '../shared/DiagramModel';

export class ErmdParser {
  /** Whether the text has `er-diagram: true` front matter */
  static isErDiagram(text: string): boolean {
    const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return false;
    try {
      return (yaml.load(fmMatch[1]) as Record<string, unknown> | null)?.['er-diagram'] === true;
    } catch {
      return false;
    }
  }

  static parse(text: string): DiagramModel {
    const model = createEmptyModel();

    const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return model;

    try {
      const fm = yaml.load(fmMatch[1]) as Record<string, unknown>;
      if (fm['er-diagram'] !== true) return model;
      if (typeof fm['version'] === 'number') model.version = fm['version'];
    } catch {
      return model;
    }

    const blockRe = /```(ermd-[\w-]+)\r?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = blockRe.exec(text)) !== null) {
      const lang = match[1];
      const content = match[2];
      try {
        const data = yaml.load(content);
        switch (lang) {
          case 'ermd-dictionary':
            if (Array.isArray(data)) {
              model.dictionary = data.map(normalizeDictionaryEntry);
            }
            break;
          case 'ermd-column-sets':
            if (Array.isArray(data)) {
              model.columnSets = data.map(normalizeColumnSet);
            }
            break;
          case 'ermd-table':
            if (data && typeof data === 'object') {
              const t = data as Record<string, unknown>;
              model.tables.push({
                id: String(t['id'] ?? ''),
                logicalName: String(t['logicalName'] ?? ''),
                physicalName: String(t['physicalName'] ?? ''),
                comment: String(t['comment'] ?? ''),
                designNote: t['designNote'] ? String(t['designNote']) : undefined,
                headerColor: t['headerColor'] ? String(t['headerColor']) : undefined,
                indexes: Array.isArray(t['indexes']) ? t['indexes'] as import('../shared/DiagramModel').TableIndex[] : undefined,
                constraints: Array.isArray(t['constraints']) ? t['constraints'] as import('../shared/DiagramModel').TableConstraint[] : undefined,
                columns: Array.isArray(t['columns'])
                  ? t['columns'].map(normalizeColumn)
                  : [],
                columnSetIds: Array.isArray(t['columnSetIds']) && t['columnSetIds'].length > 0
                  ? t['columnSetIds'].map(String)
                  : undefined,
                seedData: Array.isArray(t['seedData'])
                  ? (t['seedData'] as Record<string, unknown>[]).map((row) =>
                      Object.fromEntries(
                        Object.entries(row).map(([k, v]) => [k, v == null ? '' : String(v)])
                      )
                    )
                  : undefined,
              });
            }
            break;
          case 'ermd-relations':
            if (Array.isArray(data)) {
              model.relations = data as Relation[];
            }
            break;
          case 'ermd-database':
            if (data && typeof data === 'object') {
              const d = data as Record<string, unknown>;
              model.database = {
                name: String(d['name'] ?? ''),
                schema: d['schema'] ? String(d['schema']) : undefined,
                user: d['user'] ? String(d['user']) : undefined,
                options: (d['options'] && typeof d['options'] === 'object' ? d['options'] : {}) as DatabaseSettings['options'],
              };
            }
            break;
          case 'ermd-versions':
            if (Array.isArray(data)) {
              model.schemaVersions = data as SchemaVersion[];
            }
            break;
          case 'ermd-layout': {
            const l = data as Record<string, unknown> | null;
            if (l) {
              model.layout.nameMode =
                l['nameMode'] === 'physical' ? 'physical' : 'logical';
              if (Array.isArray(l['tables'])) {
                model.layout.tables = l['tables'] as TableLayout[];
              }
              if (Array.isArray(l['regions'])) {
                model.layout.regions = l['regions'] as RegionLayout[];
              }
              if (l['viewport'] && typeof l['viewport'] === 'object') {
                const vp = l['viewport'] as Record<string, number>;
                model.layout.viewport = {
                  x: vp['x'] ?? 0,
                  y: vp['y'] ?? 0,
                  zoom: vp['zoom'] ?? 1,
                };
              }
            }
            break;
          }
        }
      } catch {
        // skip malformed blocks
      }
    }

    return model;
  }
}

// Fill in fields a hand-edited file may omit, so the rest of the code can rely on the types

function normalizeDictionaryEntry(raw: unknown): DictionaryEntry {
  const e = (raw ?? {}) as Record<string, unknown>;
  return {
    ...(e as object),
    id: String(e['id'] ?? ''),
    name: String(e['name'] ?? ''),
    dbType: (e['dbType'] ?? 'VARCHAR') as DictionaryEntry['dbType'],
    length: typeof e['length'] === 'number' ? e['length'] : null,
    scale: typeof e['scale'] === 'number' ? e['scale'] : undefined,
    notNull: e['notNull'] === true,
    comment: String(e['comment'] ?? ''),
  };
}

function normalizeColumnSet(raw: unknown): ColumnSet {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(s['id'] ?? ''),
    name: String(s['name'] ?? ''),
    position: s['position'] === 'start' ? 'start' : 'end',
    applyToNewTables: s['applyToNewTables'] === true ? true : undefined,
    columns: Array.isArray(s['columns']) ? s['columns'].map(normalizeColumn) : [],
  };
}

function normalizeColumn(raw: unknown): Column {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    ...(c as object),
    id: String(c['id'] ?? ''),
    logicalName: String(c['logicalName'] ?? ''),
    physicalName: String(c['physicalName'] ?? ''),
    dictionaryId: String(c['dictionaryId'] ?? ''),
    isPrimaryKey: c['isPrimaryKey'] === true,
    isNullable: c['isNullable'] !== false,
    defaultValue: c['defaultValue'] == null ? null : String(c['defaultValue']),
    comment: String(c['comment'] ?? ''),
    autoIncrement: typeof c['autoIncrement'] === 'boolean' ? c['autoIncrement'] : undefined,
  };
}
