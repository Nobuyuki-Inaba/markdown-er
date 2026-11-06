import { DiagramModel } from './DiagramModel';

/** Something that makes the DDL invalid. `table` / `column` are labels for the message. */
export interface ValidationError {
  code: 'tableNameMissing' | 'columnNameMissing';
  table: string;
  column?: string;
}

/** Errors that block DDL generation. Saving the diagram is never blocked: a column may be unfinished. */
export function validateModel(model: DiagramModel): ValidationError[] {
  const errors: ValidationError[] = [];
  model.tables.forEach((table, t) => {
    const tableLabel = table.physicalName.trim() || table.logicalName.trim() || `#${t + 1}`;
    if (!table.physicalName.trim()) {
      errors.push({ code: 'tableNameMissing', table: tableLabel });
    }
    table.columns.forEach((column, c) => {
      if (!column.physicalName.trim()) {
        errors.push({ code: 'columnNameMissing', table: tableLabel, column: column.logicalName.trim() || `#${c + 1}` });
      }
    });
  });
  return errors;
}
