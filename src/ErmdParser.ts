import * as yaml from 'js-yaml';
import {
  DiagramModel, DictionaryEntry, Table, Column, Relation,
  TableLayout, RegionLayout, createEmptyModel,
} from '../shared/DiagramModel';

export class ErmdParser {
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
              model.dictionary = data as DictionaryEntry[];
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
                columns: Array.isArray(t['columns'])
                  ? (t['columns'] as Column[])
                  : [],
              });
            }
            break;
          case 'ermd-relations':
            if (Array.isArray(data)) {
              model.relations = data as Relation[];
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
