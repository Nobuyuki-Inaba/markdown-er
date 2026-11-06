import { create } from 'zustand';
import { temporal } from 'zundo';
import {
  DiagramModel, Table, Column, ColumnSet, Relation, DictionaryEntry,
  createEmptyModel, TableLayout, RegionLayout,
  TableIndex, TableConstraint, ConstraintType, DatabaseSettings, DatabaseOptions, DdlDialect, TypeSpec,
} from '@shared/DiagramModel';
import { genId } from '../util/idgen';
import { computeAutoLayout, LayoutDirection, TablePosition } from '../util/autoLayout';
import type { ParsedTableImport, ParsedDictionaryImport } from '../util/csvImport';
import type { DdlReplacement } from '@shared/ddlReplacements';
import { syncColumnSets } from '../util/columnSets';


interface DiagramState {
  model: DiagramModel;
  saveVersion: number;

  setModel: (model: DiagramModel) => void;

  addTable: (x: number, y: number) => void;
  updateTable: (tableId: string, patch: Partial<Pick<Table, 'logicalName' | 'physicalName' | 'comment' | 'designNote' | 'headerColor'>>) => void;
  updateSeedData: (tableId: string, seedData: Record<string, string>[]) => void;
  deleteTable: (tableId: string) => void;

  // Column actions take an owner: a table id or a column set id (set changes reach every table using it)
  addColumn: (ownerId: string) => void;
  updateColumn: (ownerId: string, columnId: string, patch: Partial<Column>) => void;
  deleteColumn: (ownerId: string, columnId: string) => void;
  reorderColumns: (ownerId: string, fromIndex: number, toIndex: number) => void;

  addDdlReplacement: (rule: Omit<DdlReplacement, 'id'>) => void;
  updateDdlReplacement: (id: string, patch: Partial<Omit<DdlReplacement, 'id'>>) => void;
  deleteDdlReplacement: (id: string) => void;

  addColumnSet: (set: ColumnSet) => void;
  updateColumnSet: (setId: string, patch: Partial<Pick<ColumnSet, 'name' | 'position' | 'applyToNewTables'>>) => void;
  /** Tables keep the set's columns as ordinary columns */
  deleteColumnSet: (setId: string) => void;
  setTableColumnSet: (tableId: string, setId: string, applied: boolean) => void;
  applyColumnSetToAll: (setId: string) => void;

  addRelation: (rel: Omit<Relation, 'id'>) => void;
  updateRelation: (relationId: string, patch: Partial<Omit<Relation, 'id'>>) => void;
  deleteRelation: (relationId: string) => void;

  updateLayout: (tableId: string, x: number, y: number, width: number) => void;
  updateViewport: (x: number, y: number, zoom: number) => void;
  setNameMode: (mode: 'logical' | 'physical') => void;

  updateDatabase: (patch: Partial<Pick<DatabaseSettings, 'name' | 'schema' | 'user'>>) => void;
  updateDatabaseOptions: (dialect: DdlDialect, patch: Partial<DatabaseOptions>) => void;

  addDictionaryEntry: (entry: Omit<DictionaryEntry, 'id'>) => void;
  updateDictionaryEntry: (id: string, patch: Partial<Omit<DictionaryEntry, 'id'>>) => void;
  deleteDictionaryEntry: (id: string) => void;

  applyAutoLayout: (direction: LayoutDirection) => void;

  addRegion: (x: number, y: number) => void;
  updateRegion: (id: string, patch: Partial<Pick<RegionLayout, 'label'>>) => void;
  deleteRegion: (id: string) => void;
  updateRegionLayout: (id: string, x: number, y: number, width: number, height: number) => void;

  importTables: (parsed: ParsedTableImport) => void;
  importDictionaryEntries: (parsed: ParsedDictionaryImport) => void;
  /** Create a dictionary entry and assign it to the column (one undo step) */
  addColumnType: (ownerId: string, columnId: string, entry: Omit<DictionaryEntry, 'id'>) => void;
  /** Assign a dictionary type, or a type given directly */
  setColumnType: (ownerId: string, columnId: string, choice: { entry: DictionaryEntry } | { type: TypeSpec }) => void;

  addIndex: (tableId: string) => void;
  updateIndex: (tableId: string, indexId: string, patch: Partial<Omit<TableIndex, 'id'>>) => void;
  deleteIndex: (tableId: string, indexId: string) => void;

  addConstraint: (tableId: string, type: ConstraintType) => void;
  updateConstraint: (tableId: string, constraintId: string, patch: Partial<Omit<TableConstraint, 'id'>>) => void;
  deleteConstraint: (tableId: string, constraintId: string) => void;
}

/** Columns of a table or of a column set (ids never collide: tbl_… / cset_…) */
function mapColumns(m: DiagramModel, ownerId: string, fn: (cols: Column[]) => Column[]): DiagramModel {
  if (m.columnSets?.some((s) => s.id === ownerId)) {
    return syncColumnSets({
      ...m,
      columnSets: m.columnSets.map((s) => (s.id === ownerId ? { ...s, columns: fn(s.columns) } : s)),
    });
  }
  return { ...m, tables: m.tables.map((t) => (t.id === ownerId ? { ...t, columns: fn(t.columns) } : t)) };
}

function mapColumn(m: DiagramModel, ownerId: string, columnId: string, fn: (c: Column) => Column): DiagramModel {
  return mapColumns(m, ownerId, (cols) => cols.map((c) => (c.id === columnId ? fn(c) : c)));
}

function mapTable(m: DiagramModel, tableId: string, fn: (t: Table) => Table): DiagramModel {
  return { ...m, tables: m.tables.map((t) => (t.id === tableId ? fn(t) : t)) };
}

function withSet(t: Table, setId: string): Table {
  return t.columnSetIds?.includes(setId) ? t : { ...t, columnSetIds: [...(t.columnSetIds ?? []), setId] };
}

function withoutSet(t: Table, setId: string): Table {
  const ids = (t.columnSetIds ?? []).filter((id) => id !== setId);
  return { ...t, columnSetIds: ids.length > 0 ? ids : undefined };
}

/**
 * Use a dictionary type; its NOT NULL default applies (primary keys are NOT NULL anyway)
 * and its name becomes the logical name if that is still empty.
 */
function withDictionaryType(c: Column, entry: DictionaryEntry): Column {
  return {
    ...c,
    logicalName: c.logicalName || entry.name,
    dictionaryId: entry.id,
    type: undefined,
    isNullable: c.isPrimaryKey ? c.isNullable : !entry.notNull,
  };
}

function nextVersion(state: DiagramState): number {
  return state.saveVersion + 1;
}

function updateModel(
  set: (fn: (s: DiagramState) => Partial<DiagramState>) => void,
  updater: (model: DiagramModel) => DiagramModel
) {
  set((state) => ({
    model: updater(state.model),
    saveVersion: nextVersion(state),
  }));
}

export const useDiagramStore = create<DiagramState>()(
  temporal(
    (set) => ({
      model: createEmptyModel(),
      saveVersion: 0,

      // saveVersion is intentionally left untouched: the extension host drops
      // saves whose version is not greater than the last one it wrote.
      setModel: (model) => set({ model }),

      addTable: (x, y) =>
        updateModel(set, (m) => {
          const id = genId('tbl');
          const autoSets = (m.columnSets ?? []).filter((cs) => cs.applyToNewTables).map((cs) => cs.id);
          const newTable: Table = {
            id,
            logicalName: 'New Table',
            physicalName: 'new_table',
            comment: '',
            columns: [],
            columnSetIds: autoSets.length > 0 ? autoSets : undefined,
          };
          const layout: TableLayout = { tableId: id, x, y, width: 240 };
          return syncColumnSets({
            ...m,
            tables: [...m.tables, newTable],
            layout: { ...m.layout, tables: [...m.layout.tables, layout] },
          });
        }),

      updateTable: (tableId, patch) =>
        updateModel(set, (m) => ({
          ...m,
          tables: m.tables.map((t) =>
            t.id === tableId ? { ...t, ...patch } : t
          ),
        })),

      updateSeedData: (tableId, seedData) =>
        updateModel(set, (m) => ({
          ...m,
          tables: m.tables.map((t) =>
            t.id === tableId
              ? { ...t, seedData: seedData.length > 0 ? seedData : undefined }
              : t
          ),
        })),

      deleteTable: (tableId) =>
        updateModel(set, (m) => ({
          ...m,
          tables: m.tables.filter((t) => t.id !== tableId),
          relations: m.relations.filter(
            (r) => r.fromTableId !== tableId && r.toTableId !== tableId
          ),
          layout: {
            ...m.layout,
            tables: m.layout.tables.filter((l) => l.tableId !== tableId),
          },
        })),

      addColumn: (ownerId) =>
        updateModel(set, (m) => {
          const newCol: Column = {
            id: genId('col'),
            logicalName: '',
            physicalName: '',
            dictionaryId: '',
            isPrimaryKey: false,
            isNullable: true,
            defaultValue: null,
            comment: '',
          };
          // A table's own columns go before the column sets at its end
          return mapColumns(m, ownerId, (cols) => {
            let at = cols.length;
            while (at > 0 && cols[at - 1].columnSet) at--;
            return [...cols.slice(0, at), newCol, ...cols.slice(at)];
          });
        }),

      updateColumn: (ownerId, columnId, patch) =>
        updateModel(set, (m) => mapColumn(m, ownerId, columnId, (c) => ({ ...c, ...patch }))),

      deleteColumn: (ownerId, columnId) =>
        updateModel(set, (m) => mapColumns(m, ownerId, (cols) => cols.filter((c) => c.id !== columnId))),

      reorderColumns: (ownerId, fromIndex, toIndex) =>
        updateModel(set, (m) => mapColumns(m, ownerId, (cols) => {
          const next = [...cols];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return next;
        })),

      addDdlReplacement: (rule) =>
        updateModel(set, (m) => ({ ...m, ddlReplacements: [...(m.ddlReplacements ?? []), { ...rule, id: genId('repl') }] })),

      updateDdlReplacement: (id, patch) =>
        updateModel(set, (m) => ({
          ...m,
          ddlReplacements: (m.ddlReplacements ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      deleteDdlReplacement: (id) =>
        updateModel(set, (m) => {
          const rules = (m.ddlReplacements ?? []).filter((r) => r.id !== id);
          return { ...m, ddlReplacements: rules.length > 0 ? rules : undefined };
        }),

      addColumnSet: (columnSet) =>
        updateModel(set, (m) => ({ ...m, columnSets: [...(m.columnSets ?? []), columnSet] })),

      updateColumnSet: (setId, patch) =>
        updateModel(set, (m) => ({
          ...m,
          columnSets: (m.columnSets ?? []).map((s) => (s.id === setId ? { ...s, ...patch } : s)),
        })),

      deleteColumnSet: (setId) =>
        updateModel(set, (m) => syncColumnSets({
          ...m,
          columnSets: (m.columnSets ?? []).filter((s) => s.id !== setId),
          tables: m.tables.map((t) => withoutSet(t, setId)),
        })),

      setTableColumnSet: (tableId, setId, applied) =>
        updateModel(set, (m) => syncColumnSets(mapTable(m, tableId, (t) => (applied ? withSet(t, setId) : withoutSet(t, setId))))),

      applyColumnSetToAll: (setId) =>
        updateModel(set, (m) => syncColumnSets({ ...m, tables: m.tables.map((t) => withSet(t, setId)) })),

      addRelation: (rel) =>
        updateModel(set, (m) => ({
          ...m,
          relations: [...m.relations, { ...rel, id: genId('rel') }],
        })),

      updateRelation: (relationId, patch) =>
        updateModel(set, (m) => ({
          ...m,
          relations: m.relations.map((r) =>
            r.id === relationId ? { ...r, ...patch } : r
          ),
        })),

      deleteRelation: (relationId) =>
        updateModel(set, (m) => ({
          ...m,
          relations: m.relations.filter((r) => r.id !== relationId),
        })),

      updateLayout: (tableId, x, y, width) =>
        set((state) => ({
          model: {
            ...state.model,
            layout: {
              ...state.model.layout,
              tables: state.model.layout.tables.map((l) =>
                l.tableId === tableId ? { ...l, x, y, width } : l
              ),
            },
          },
          saveVersion: nextVersion(state),
        })),

      // Panning / zooming is persisted but must not land on the undo stack
      updateViewport: (x, y, zoom) =>
        withoutHistory(() =>
          set((state) => ({
            model: {
              ...state.model,
              layout: { ...state.model.layout, viewport: { x, y, zoom } },
            },
            saveVersion: nextVersion(state),
          }))
        ),

      setNameMode: (mode) =>
        updateModel(set, (m) => ({
          ...m,
          layout: { ...m.layout, nameMode: mode },
        })),

      updateDatabase: (patch) =>
        updateModel(set, (m) => ({
          ...m,
          database: { name: '', options: {}, ...m.database, ...patch },
        })),

      updateDatabaseOptions: (dialect, patch) =>
        updateModel(set, (m) => {
          const db = m.database ?? { name: '', options: {} };
          return { ...m, database: { ...db, options: { ...db.options, [dialect]: { ...db.options[dialect], ...patch } } } };
        }),

      addDictionaryEntry: (entry) =>
        updateModel(set, (m) => ({
          ...m,
          dictionary: [...m.dictionary, { ...entry, id: genId('dict') }],
        })),

      updateDictionaryEntry: (id, patch) =>
        updateModel(set, (m) => ({
          ...m,
          dictionary: m.dictionary.map((e) =>
            e.id === id ? { ...e, ...patch } : e
          ),
        })),

      deleteDictionaryEntry: (id) =>
        updateModel(set, (m) => ({
          ...m,
          dictionary: m.dictionary.filter((e) => e.id !== id),
        })),

      applyAutoLayout: (direction) =>
        updateModel(set, (m) => {
          const positions: TablePosition[] = computeAutoLayout(m, direction);
          return {
            ...m,
            layout: {
              ...m.layout,
              tables: m.layout.tables.map((l) => {
                const pos = positions.find((p) => p.tableId === l.tableId);
                return pos ? { ...l, x: pos.x, y: pos.y, width: pos.width } : l;
              }),
            },
          };
        }),

      addRegion: (x, y) =>
        updateModel(set, (m) => {
          const id = genId('rgn');
          const region: RegionLayout = { id, label: 'Region', x, y, width: 400, height: 300 };
          return {
            ...m,
            layout: { ...m.layout, regions: [...m.layout.regions, region] },
          };
        }),

      updateRegion: (id, patch) =>
        updateModel(set, (m) => ({
          ...m,
          layout: {
            ...m.layout,
            regions: m.layout.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)),
          },
        })),

      deleteRegion: (id) =>
        updateModel(set, (m) => ({
          ...m,
          layout: {
            ...m.layout,
            regions: m.layout.regions.filter((r) => r.id !== id),
          },
        })),

      updateRegionLayout: (id, x, y, width, height) =>
        set((state) => ({
          model: {
            ...state.model,
            layout: {
              ...state.model.layout,
              regions: state.model.layout.regions.map((r) =>
                r.id === id ? { ...r, x, y, width, height } : r
              ),
            },
          },
          saveVersion: nextVersion(state),
        })),

      importTables: ({ tables, autoCreatedDictEntries }) =>
        updateModel(set, (m) => {
          const GRID_COLS = 4;
          const STEP_X = 280;
          const STEP_Y = 200;
          const startX = 60;
          const startY = 60 + m.layout.tables.length * 10;
          const newLayouts: TableLayout[] = tables.map((t, i) => ({
            tableId: t.id,
            x: startX + (i % GRID_COLS) * STEP_X,
            y: startY + Math.floor(i / GRID_COLS) * STEP_Y,
            width: 260,
          }));
          return {
            ...m,
            dictionary: [...m.dictionary, ...autoCreatedDictEntries],
            tables: [...m.tables, ...tables],
            layout: {
              ...m.layout,
              tables: [...m.layout.tables, ...newLayouts],
            },
          };
        }),

      importDictionaryEntries: ({ entries }) =>
        updateModel(set, (m) => ({
          ...m,
          dictionary: [...m.dictionary, ...entries],
        })),

      addColumnType: (ownerId, columnId, entry) =>
        updateModel(set, (m) => {
          const dictEntry: DictionaryEntry = { ...entry, id: genId('dict') };
          return mapColumn({ ...m, dictionary: [...m.dictionary, dictEntry] }, ownerId, columnId, (c) => withDictionaryType(c, dictEntry));
        }),

      setColumnType: (ownerId, columnId, choice) =>
        updateModel(set, (m) => mapColumn(m, ownerId, columnId, (c) =>
          'entry' in choice ? withDictionaryType(c, choice.entry) : { ...c, dictionaryId: '', type: choice.type }
        )),

      addIndex: (tableId) =>
        updateModel(set, (m) => ({
          ...m,
          tables: m.tables.map((t) =>
            t.id === tableId
              ? { ...t, indexes: [...(t.indexes ?? []), { id: genId('idx'), name: '', columns: [], unique: false }] }
              : t
          ),
        })),

      updateIndex: (tableId, indexId, patch) =>
        updateModel(set, (m) => ({
          ...m,
          tables: m.tables.map((t) =>
            t.id === tableId
              ? { ...t, indexes: (t.indexes ?? []).map((i) => i.id === indexId ? { ...i, ...patch } : i) }
              : t
          ),
        })),

      deleteIndex: (tableId, indexId) =>
        updateModel(set, (m) => ({
          ...m,
          tables: m.tables.map((t) =>
            t.id === tableId
              ? { ...t, indexes: (t.indexes ?? []).filter((i) => i.id !== indexId) || undefined }
              : t
          ),
        })),

      addConstraint: (tableId, type) =>
        updateModel(set, (m) => ({
          ...m,
          tables: m.tables.map((t) =>
            t.id === tableId
              ? { ...t, constraints: [...(t.constraints ?? []), { id: genId('cst'), type, name: '', expression: '' }] }
              : t
          ),
        })),

      updateConstraint: (tableId, constraintId, patch) =>
        updateModel(set, (m) => ({
          ...m,
          tables: m.tables.map((t) =>
            t.id === tableId
              ? { ...t, constraints: (t.constraints ?? []).map((c) => c.id === constraintId ? { ...c, ...patch } : c) }
              : t
          ),
        })),

      deleteConstraint: (tableId, constraintId) =>
        updateModel(set, (m) => ({
          ...m,
          tables: m.tables.map((t) =>
            t.id === tableId
              ? { ...t, constraints: (t.constraints ?? []).filter((c) => c.id !== constraintId) || undefined }
              : t
          ),
        })),
    }),
    {
      limit: 100,
      // Exclude saveVersion from undo history — only track model changes
      partialize: (state) => ({ model: state.model }),
      // Record a history entry only when the model actually changed
      equality: (past, current) => past.model === current.model,
    }
  )
);

function withoutHistory(fn: () => void) {
  const temporal = useDiagramStore.temporal.getState();
  temporal.pause();
  try {
    fn();
  } finally {
    temporal.resume();
  }
}

/** Replace the whole model (file load / external change) and reset undo history. */
export function loadModel(model: DiagramModel) {
  withoutHistory(() => useDiagramStore.getState().setModel(model));
  useDiagramStore.temporal.getState().clear();
}

/** Update schema versions only. Versions are owned by the extension host, so this is not undoable. */
export function setSchemaVersions(schemaVersions: DiagramModel['schemaVersions']) {
  withoutHistory(() =>
    useDiagramStore.setState((s) => ({ model: { ...s.model, schemaVersions } }))
  );
}

/**
 * Undo / redo, then persist the result.
 * Viewport and schema versions are kept as-is: neither is part of the undoable history.
 */
export function applyHistory(action: 'undo' | 'redo') {
  const temporal = useDiagramStore.temporal.getState();
  const stack = action === 'undo' ? temporal.pastStates : temporal.futureStates;
  if (stack.length === 0) return;

  const { viewport } = useDiagramStore.getState().model.layout;
  const { schemaVersions } = useDiagramStore.getState().model;
  temporal[action]();
  withoutHistory(() =>
    useDiagramStore.setState((s) => ({
      model: { ...s.model, schemaVersions, layout: { ...s.model.layout, viewport } },
      saveVersion: s.saveVersion + 1,
    }))
  );
}
