import { create } from 'zustand';
import type { DdlDialect } from '@shared/messages';

interface UiState {
  selectedTableId: string | null;
  selectedRelationId: string | null;
  selectedRegionId: string | null;
  isDictionaryOpen: boolean;
  isDdlOpen: boolean;
  lastDdl: string;
  dialect: DdlDialect;
  ddlInsertSeedData: boolean;
  ddlSkipAutoIncrementPk: boolean;
  showMinimap: boolean;

  selectTable: (id: string | null) => void;
  selectRelation: (id: string | null) => void;
  selectRegion: (id: string | null) => void;
  openDictionary: () => void;
  closeDictionary: () => void;
  openDdl: (ddl: string) => void;
  closeDdl: () => void;
  setDialect: (dialect: DdlDialect) => void;
  setDdlOptions: (insertSeedData: boolean, skipAutoIncrementPk: boolean) => void;
  toggleMinimap: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  selectedTableId: null,
  selectedRelationId: null,
  selectedRegionId: null,
  isDictionaryOpen: false,
  isDdlOpen: false,
  lastDdl: '',
  dialect: 'mysql',
  ddlInsertSeedData: false,
  ddlSkipAutoIncrementPk: false,
  showMinimap: true,

  selectTable: (id) => set({ selectedTableId: id, selectedRelationId: null, selectedRegionId: null }),
  selectRelation: (id) => set({ selectedRelationId: id, selectedTableId: null, selectedRegionId: null }),
  selectRegion: (id) => set({ selectedRegionId: id, selectedTableId: null, selectedRelationId: null }),
  openDictionary: () => set({ isDictionaryOpen: true }),
  closeDictionary: () => set({ isDictionaryOpen: false }),
  openDdl: (ddl) => set({ isDdlOpen: true, lastDdl: ddl }),
  closeDdl: () => set({ isDdlOpen: false }),
  setDialect: (dialect) => set({ dialect }),
  setDdlOptions: (insertSeedData, skipAutoIncrementPk) => set({ ddlInsertSeedData: insertSeedData, ddlSkipAutoIncrementPk: skipAutoIncrementPk }),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
}));
