import { Column, DbType, DdlDialect, DiagramModel, Table, columnTypeSpec } from './DiagramModel';

/** Integer types each database auto-increments. Drives the dialect classes and the seed data editor. */
export const AUTO_INCREMENT_TYPES: Record<DdlDialect, readonly DbType[]> = {
  mysql:      ['INT', 'BIGINT'],
  postgresql: ['INT', 'BIGINT'],
  oracle:     ['INT', 'BIGINT'],
  sqlserver:  ['INT', 'BIGINT'],
  sqlite:     ['INT', 'BIGINT', 'SMALLINT', 'TINYINT'],
};

type ModelRefs = Pick<DiagramModel, 'relations' | 'dictionary'>;

/** Only an integer primary key can auto-increment; `Column.autoIncrement` is ignored elsewhere */
export function canAutoIncrement(col: Column, model: Pick<DiagramModel, 'dictionary'>, types: readonly DbType[]): boolean {
  const dbType = columnTypeSpec(col, model.dictionary)?.dbType;
  return col.isPrimaryKey && !!dbType && types.includes(dbType);
}

/**
 * The table's auto-increment column: the first eligible one the user turned on; else, unless turned off,
 * a single-column integer primary key that is not itself a foreign key (e.g. the child side of a 1:1 relation).
 * Composite keys of junction tables therefore never do by default.
 */
export function autoIncrementColumn(table: Table, model: ModelRefs, types: readonly DbType[]): Column | undefined {
  const explicit = table.columns.find((c) => c.autoIncrement === true && canAutoIncrement(c, model, types));
  if (explicit) { return explicit; }
  return defaultAutoIncrementColumn(table, model, types);
}

/** What `autoIncrementColumn()` picks when the user hasn't decided; a column turned off is never picked */
function defaultAutoIncrementColumn(table: Table, model: ModelRefs, types: readonly DbType[]): Column | undefined {
  const pk = table.columns.filter((c) => c.isPrimaryKey);
  if (pk.length !== 1) { return undefined; }
  const col = pk[0];
  if (col.autoIncrement === false || !canAutoIncrement(col, model, types)) { return undefined; }
  const isForeignKey = model.relations.some((r) => r.toTableId === table.id && r.toColumnId === col.id);
  return isForeignKey ? undefined : col;
}

/** A seed cell left empty: NULL, or the generated value for an auto-increment column */
export function isEmptySeedValue(value: string | null | undefined): boolean {
  return value === undefined || value === null || value === '';
}
