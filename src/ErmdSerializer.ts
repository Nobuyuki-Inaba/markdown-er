import * as yaml from 'js-yaml';
import * as vscode from 'vscode';
import { DiagramModel } from '../shared/DiagramModel';

export class ErmdSerializer {
  static serialize(model: DiagramModel, fileUri: vscode.Uri): string {
    const filename = fileUri.path.split('/').pop() ?? 'ER Diagram';
    const title = filename.replace(/\.ermd$/, '');

    const lines: string[] = [];

    lines.push('---');
    lines.push('er-diagram: true');
    lines.push(`version: ${model.version}`);
    lines.push('---');
    lines.push('');
    lines.push(`# ${title}`);

    if (model.dictionary.length > 0) {
      lines.push('');
      lines.push('## Dictionary');
      lines.push('');
      lines.push('```ermd-dictionary');
      lines.push(yaml.dump(model.dictionary, { indent: 2, lineWidth: -1 }).trimEnd());
      lines.push('```');
    }

    if (model.tables.length > 0) {
      lines.push('');
      lines.push('## Tables');
      for (const table of model.tables) {
        lines.push('');
        lines.push('```ermd-table');
        lines.push(yaml.dump(table, { indent: 2, lineWidth: -1 }).trimEnd());
        lines.push('```');
      }
    }

    if (model.relations.length > 0) {
      lines.push('');
      lines.push('## Relations');
      lines.push('');
      lines.push('```ermd-relations');
      lines.push(yaml.dump(model.relations, { indent: 2, lineWidth: -1 }).trimEnd());
      lines.push('```');
    }

    lines.push('');
    lines.push('## Layout');
    lines.push('');
    lines.push('```ermd-layout');
    lines.push(yaml.dump(model.layout, { indent: 2, lineWidth: -1 }).trimEnd());
    lines.push('```');

    if (model.schemaVersions && model.schemaVersions.length > 0) {
      lines.push('');
      lines.push('## Versions');
      lines.push('');
      lines.push('```ermd-versions');
      lines.push(yaml.dump(model.schemaVersions, { indent: 2, lineWidth: -1 }).trimEnd());
      lines.push('```');
    }

    return lines.join('\n') + '\n';
  }
}
