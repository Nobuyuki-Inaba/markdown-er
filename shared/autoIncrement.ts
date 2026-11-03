import { Column, DbType, DdlDialect, DiagramModel, Table, columnTypeSpec } from './DiagramModel';

/** Integer types each database auto-increments. Drives the dialect classes and the seed data editor. */
export const AUTO_INCREMENT_TYPES: Record<DdlDialect, readonly DbType[]> = {
  mysql:      ['INT', 'BIGINT'],
  postgresql: ['INT', 'BIGINT'],
  oracle:     ['INT', 'BIGINT'],
  sqlserver:  ['INT', 'BIGINT'],
  sqlite:     ['INT', 'BIGINT', 'SMALLINT', 'TINYINT'],
};

/**
 * Only a single-column integer primary key that is not itself a foreign key
 * (e.g. the child side of a 1:1 relation) becomes auto-increment.
 * Composite keys of junction tables therefore never do.
 */
export function autoIncrementColumn(
  table: Table,
  model: Pick<DiagramModel, 'relations' | 'dictionary'>,
  types: readonly DbType[],
): Column | undefined {
  const pk = table.columns.filter((c) => c.isPrimaryKey);
  if (pk.length !== 1) { return undefined; }
  const col = pk[0];
  const dbType = columnTypeSpec(col, model.dictionary)?.dbType;
  if (!dbType || !types.includes(dbType)) { return undefined; }
  const isForeignKey = model.relations.some((r) => r.toTableId === table.id && r.toColumnId === col.id);
  return isForeignKey ? undefined : col;
}

/** A seed cell left empty: NULL, or the generated value for an auto-increment column */
export function isEmptySeedValue(value: string | null | undefined): boolean {
  return value === undefined || value === null || value === '';
}
