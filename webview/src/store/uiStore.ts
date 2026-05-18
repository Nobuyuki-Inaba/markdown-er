import { create } from 'zustand';

interface UiState {
  selectedTableId: string | null;
  selectedRelationId: string | null;
  isDictionaryOpen: boolean;
  isDdlOpen: boolean;
  lastDdl: string;

  selectTable: (id: string | null) => void;
  selectRelation: (id: string | null) => void;
  openDictionary: () => void;
  closeDictionary: () => void;
  openDdl: (ddl: string) => void;
  closeDdl: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  selectedTableId: null,
  selectedRelationId: null,
  isDictionaryOpen: false,
  isDdlOpen: false,
  lastDdl: '',

  selectTable: (id) => set({ selectedTableId: id, selectedRelationId: null }),
  selectRelation: (id) => set({ selectedRelationId: id, selectedTableId: null }),
  openDictionary: () => set({ isDictionaryOpen: true }),
  closeDictionary: () => set({ isDictionaryOpen: false }),
  openDdl: (ddl) => set({ isDdlOpen: true, lastDdl: ddl }),
  closeDdl: () => set({ isDdlOpen: false }),
}));
