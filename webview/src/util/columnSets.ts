import { Column, ColumnSet, DiagramModel, Table } from '@shared/DiagramModel';
import { genId } from './idgen';

/**
 * Make every table's set-derived columns match the column sets it uses:
 * update in place (instance ids stay, so relations and indexes keep working),
 * add new set columns, drop columns of sets the table no longer uses.
 * Columns whose set no longer exists become ordinary columns.
 */
export function syncColumnSets(model: DiagramModel): DiagramModel {
  const sets = new Map((model.columnSets ?? []).map((s) => [s.id, s]));
  let changed = false;
  const tables = model.tables.map((t) => {
    const synced = syncTable(t, sets);
    if (synced !== t) changed = true;
    return synced;
  });
  return changed ? { ...model, tables } : model;
}

function syncTable(table: Table, sets: Map<string, ColumnSet>): Table {
  const applied = (table.columnSetIds ?? []).map((id) => sets.get(id)).filter((s): s is ColumnSet => !!s);
  if (applied.length === 0 && !table.columns.some((c) => c.columnSet)) return table;

  // Orphans (set deleted) become ordinary columns; columns of unapplied sets are dropped
  let columns = table.columns
    .filter((c) => !c.columnSet || !sets.has(c.columnSet.setId) || applied.some((s) => s.id === c.columnSet!.setId))
    .map((c) => (c.columnSet && !sets.has(c.columnSet.setId) ? { ...c, columnSet: undefined } : c));

  for (const set of applied) {
    const existing = new Map(
      columns.filter((c) => c.columnSet?.setId === set.id).map((c) => [c.columnSet!.columnId, c])
    );
    const instances = set.columns.map((tpl) => instanceOf(tpl, set.id, existing.get(tpl.id)));
    // Keep the set where it already is in the table; otherwise put it at its position
    const firstIndex = columns.findIndex((c) => c.columnSet?.setId === set.id);
    const rest = columns.filter((c) => c.columnSet?.setId !== set.id);
    const at = firstIndex >= 0 ? firstIndex : set.position === 'start' ? leadingSetColumns(rest) : rest.length;
    columns = [...rest.slice(0, at), ...instances, ...rest.slice(at)];
  }

  const same = columns.length === table.columns.length &&
    columns.every((c, i) => JSON.stringify(c) === JSON.stringify(table.columns[i]));
  return same ? table : { ...table, columns };
}

/** Index after the set columns already at the start, so "start" sets keep their order */
function leadingSetColumns(columns: Column[]): number {
  const i = columns.findIndex((c) => !c.columnSet);
  return i < 0 ? columns.length : i;
}

function instanceOf(tpl: Column, setId: string, current: Column | undefined): Column {
  return {
    ...tpl,
    id: current?.id ?? genId('col'),
    columnSet: { setId, columnId: tpl.id },
  };
}

/** Starter set: version and created / updated by + at */
export function auditColumnSet(names: {
  name: string; version: string; createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
}): ColumnSet {
  const col = (logicalName: string, physicalName: string, type: Column['type'], defaultValue: string | null): Column => ({
    id: genId('col'), logicalName, physicalName, dictionaryId: '', type,
    isPrimaryKey: false, isNullable: false, defaultValue, comment: '',
  });
  const user = { dbType: 'VARCHAR' as const, length: 50 };
  const timestamp = { dbType: 'TIMESTAMP' as const, length: null };
  return {
    id: genId('cset'),
    name: names.name,
    position: 'end',
    applyToNewTables: true,
    columns: [
      col(names.version, 'version', { dbType: 'INT', length: null }, '0'),
      col(names.createdAt, 'created_at', timestamp, 'CURRENT_TIMESTAMP'),
      col(names.createdBy, 'created_by', user, null),
      col(names.updatedAt, 'updated_at', timestamp, 'CURRENT_TIMESTAMP'),
      col(names.updatedBy, 'updated_by', user, null),
    ],
  };
}
