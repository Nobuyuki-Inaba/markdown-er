import { create } from 'zustand';
import type { DdlDialect } from '@shared/messages';

interface UiState {
  selectedTableId: string | null;
  selectedRelationId: string | null;
  isDictionaryOpen: boolean;
  isDdlOpen: boolean;
  lastDdl: string;
  dialect: DdlDialect;

  selectTable: (id: string | null) => void;
  selectRelation: (id: string | null) => void;
  openDictionary: () => void;
  closeDictionary: () => void;
  openDdl: (ddl: string) => void;
  closeDdl: () => void;
  setDialect: (dialect: DdlDialect) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  selectedTableId: null,
  selectedRelationId: null,
  isDictionaryOpen: false,
  isDdlOpen: false,
  lastDdl: '',
  dialect: 'mysql',

  selectTable: (id) => set({ selectedTableId: id, selectedRelationId: null }),
  selectRelation: (id) => set({ selectedRelationId: id, selectedTableId: null }),
  openDictionary: () => set({ isDictionaryOpen: true }),
  closeDictionary: () => set({ isDictionaryOpen: false }),
  openDdl: (ddl) => set({ isDdlOpen: true, lastDdl: ddl }),
  closeDdl: () => set({ isDdlOpen: false }),
  setDialect: (dialect) => set({ dialect }),
}));
