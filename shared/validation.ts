import { DiagramModel, Table, columnTypeSpec } from './DiagramModel';

/** Something that makes the DDL wrong. `table` / `column` are labels for the message; a relation's `table` is `parent → child`. */
export interface ValidationError {
  code:
    | 'tableNameMissing' | 'tableNameDuplicate'
    | 'columnNameMissing' | 'columnNameDuplicate' | 'columnTypeMissing'
    | 'relationColumnMissing';
  table: string;
  column?: string;
}

/** Names used more than once, ignoring case (most databases do); empty names are reported on their own */
function duplicates(names: string[]): string[] {
  const seen = new Map<string, { name: string; count: number }>();
  for (const name of names.map((n) => n.trim()).filter(Boolean)) {
    const key = name.toLowerCase();
    seen.set(key, { name: seen.get(key)?.name ?? name, count: (seen.get(key)?.count ?? 0) + 1 });
  }
  return [...seen.values()].filter((n) => n.count > 1).map((n) => n.name);
}

function tableLabel(table: Table | undefined, index: number): string {
  return table?.physicalName.trim() || table?.logicalName.trim() || `#${index + 1}`;
}

/**
 * Errors that block DDL generation. Saving the diagram is never blocked: a column may be unfinished.
 * A relation without an FK constraint generates nothing, so only one with the constraint needs its columns here.
 */
export function validateModel(model: DiagramModel): ValidationError[] {
  const errors: ValidationError[] = [];
  model.tables.forEach((table, t) => {
    const label = tableLabel(table, t);
    if (!table.physicalName.trim()) {
      errors.push({ code: 'tableNameMissing', table: label });
    }
    table.columns.forEach((column, c) => {
      const columnLabel = column.physicalName.trim() || column.logicalName.trim() || `#${c + 1}`;
      if (!column.physicalName.trim()) {
        errors.push({ code: 'columnNameMissing', table: label, column: columnLabel });
      }
      if (!columnTypeSpec(column, model.dictionary)) {
        errors.push({ code: 'columnTypeMissing', table: label, column: columnLabel });
      }
    });
    for (const column of duplicates(table.columns.map((c) => c.physicalName))) {
      errors.push({ code: 'columnNameDuplicate', table: label, column });
    }
  });
  for (const table of duplicates(model.tables.map((t) => t.physicalName))) {
    errors.push({ code: 'tableNameDuplicate', table });
  }
  const find = (id: string) => {
    const index = model.tables.findIndex((t) => t.id === id);
    return { table: model.tables[index], label: index < 0 ? '?' : tableLabel(model.tables[index], index) };
  };
  for (const relation of model.relations) {
    if (!relation.hasForeignKey) { continue; }
    const from = find(relation.fromTableId);
    const to = find(relation.toTableId);
    if (!from.table?.columns.some((c) => c.id === relation.fromColumnId)
      || !to.table?.columns.some((c) => c.id === relation.toColumnId)) {
      errors.push({ code: 'relationColumnMissing', table: `${from.label} → ${to.label}` });
    }
  }
  return errors;
}
