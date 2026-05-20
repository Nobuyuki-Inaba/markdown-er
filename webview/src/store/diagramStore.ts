import { create } from 'zustand';
import { temporal } from 'zundo';
import {
  DiagramModel, Table, Column, Relation, DictionaryEntry,
  createEmptyModel, TableLayout, RegionLayout, SchemaSnapshot,
} from '@shared/DiagramModel';
import { genId } from '../util/idgen';
import { computeAutoLayout, LayoutDirection, TablePosition } from '../util/autoLayout';

interface DiagramState {
  model: DiagramModel;
  saveVersion: number;

  setModel: (model: DiagramModel) => void;

  addTable: (x: number, y: number) => void;
  updateTable: (tableId: string, patch: Partial<Pick<Table, 'logicalName' | 'physicalName' | 'comment' | 'designNote' | 'headerColor'>>) => void;
  updateSeedData: (tableId: string, seedData: Record<string, string>[]) => void;
  deleteTable: (tableId: string) => void;

  addColumn: (tableId: string) => void;
  updateColumn: (tableId: string, columnId: string, patch: Partial<Column>) => void;
  deleteColumn: (tableId: string, columnId: string) => void;
  reorderColumns: (tableId: string, fromIndex: number, toIndex: number) => void;

  addRelation: (rel: Omit<Relation, 'id'>) => void;
  updateRelation: (relationId: string, patch: Partial<Omit<Relation, 'id'>>) => void;
  deleteRelation: (relationId: string) => void;

  updateLayout: (tableId: string, x: number, y: number, width: number) => void;
  updateViewport: (x: number, y: number, zoom: number) => void;
  setNameMode: (mode: 'logical' | 'physical') => void;

  addDictionaryEntry: (entry: Omit<DictionaryEntry, 'id'>) => void;
  updateDictionaryEntry: (id: string, patch: Partial<Omit<DictionaryEntry, 'id'>>) => void;
  deleteDictionaryEntry: (id: string) => void;

  applyAutoLayout: (direction: LayoutDirection) => void;

  addRegion: (x: number, y: number) => void;
  updateRegion: (id: string, patch: Partial<Pick<RegionLayout, 'label'>>) => void;
  deleteRegion: (id: string) => void;
  updateRegionLayout: (id: string, x: number, y: number, width: number, height: number) => void;

  saveSnapshot: (name: string) => void;
  deleteSnapshot: (id: string) => void;
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

      setModel: (model) => set({ model, saveVersion: 0 }),

      addTable: (x, y) =>
        updateModel(set, (m) => {
          const id = genId('tbl');
          const newTable: Table = {
            id,
            logicalName: 'New Table',
            physicalName: 'new_table',
            comment: '',
            columns: [],
          };
          const layout: TableLayout = { tableId: id, x, y, width: 240 };
          return {
            ...m,
            tables: [...m.tables, newTable],
            layout: { ...m.layout, tables: [...m.layout.tables, layout] },
          };
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

      addColumn: (tableId) =>
        updateModel(set, (m) => {
          const colId = genId('col');
          const newCol: Column = {
            id: colId,
            logicalName: 'Column',
            physicalName: 'column',
            dictionaryId: m.dictionary[0]?.id ?? '',
            isPrimaryKey: false,
            isNullable: true,
            defaultValue: null,
            comment: '',
          };
          return {
            ...m,
            tables: m.tables.map((t) =>
              t.id === tableId ? { ...t, columns: [...t.columns, newCol] } : t
            ),
          };
        }),

      updateColumn: (tableId, columnId, patch) =>
        updateModel(set, (m) => ({
          ...m,
          tables: m.tables.map((t) =>
            t.id === tableId
              ? {
                  ...t,
                  columns: t.columns.map((c) =>
                    c.id === columnId ? { ...c, ...patch } : c
                  ),
                }
              : t
          ),
        })),

      deleteColumn: (tableId, columnId) =>
        updateModel(set, (m) => ({
          ...m,
          tables: m.tables.map((t) =>
            t.id === tableId
              ? { ...t, columns: t.columns.filter((c) => c.id !== columnId) }
              : t
          ),
        })),

      reorderColumns: (tableId, fromIndex, toIndex) =>
        updateModel(set, (m) => ({
          ...m,
          tables: m.tables.map((t) => {
            if (t.id !== tableId) return t;
            const cols = [...t.columns];
            const [moved] = cols.splice(fromIndex, 1);
            cols.splice(toIndex, 0, moved);
            return { ...t, columns: cols };
          }),
        })),

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

      updateViewport: (x, y, zoom) =>
        set((state) => ({
          model: {
            ...state.model,
            layout: { ...state.model.layout, viewport: { x, y, zoom } },
          },
          saveVersion: nextVersion(state),
        })),

      setNameMode: (mode) =>
        updateModel(set, (m) => ({
          ...m,
          layout: { ...m.layout, nameMode: mode },
        })),

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

      saveSnapshot: (name) =>
        updateModel(set, (m) => {
          const snap: SchemaSnapshot = {
            id: genId('snap'),
            name,
            date: new Date().toISOString(),
            tables: m.tables,
            relations: m.relations,
            dictionary: m.dictionary,
          };
          return { ...m, snapshots: [...(m.snapshots ?? []), snap] };
        }),

      deleteSnapshot: (id) =>
        updateModel(set, (m) => ({
          ...m,
          snapshots: (m.snapshots ?? []).filter((s) => s.id !== id),
        })),
    }),
    {
      limit: 100,
      // Exclude saveVersion from undo history — only track model changes
      partialize: (state) => ({ model: state.model }),
    }
  )
);
