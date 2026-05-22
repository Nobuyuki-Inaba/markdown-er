import { create } from 'zustand';
import type { DdlDialect } from '@shared/messages';

interface UiState {
  selectedTableId: string | null;
  selectedRelationId: string | null;
  selectedRegionId: string | null;
  isDictionaryOpen: boolean;
  isCsvImportOpen: boolean;
  isVersionsOpen: boolean;
  isDdlOpen: boolean;
  lastDdl: string;
  dialect: DdlDialect;
  ddlInsertSeedData: boolean;
  ddlSkipAutoIncrementPk: boolean;
  ddlMode: 'full' | 'version-diff';
  ddlFromVersionId: string | null;
  ddlToVersionId: string | null;
  showMinimap: boolean;
  searchQuery: string;

  selectTable: (id: string | null) => void;
  selectRelation: (id: string | null) => void;
  selectRegion: (id: string | null) => void;
  openDictionary: () => void;
  closeDictionary: () => void;
  openCsvImport: () => void;
  closeCsvImport: () => void;
  openVersions: () => void;
  closeVersions: () => void;
  openDdl: (ddl: string) => void;
  closeDdl: () => void;
  setDialect: (dialect: DdlDialect) => void;
  setDdlOptions: (insertSeedData: boolean, skipAutoIncrementPk: boolean) => void;
  setDdlMode: (mode: 'full' | 'version-diff') => void;
  setDdlVersions: (fromVersionId: string | null, toVersionId: string | null) => void;
  toggleMinimap: () => void;
  setSearchQuery: (query: string) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  selectedTableId: null,
  selectedRelationId: null,
  selectedRegionId: null,
  isDictionaryOpen: false,
  isCsvImportOpen: false,
  isVersionsOpen: false,
  isDdlOpen: false,
  lastDdl: '',
  dialect: 'mysql',
  ddlInsertSeedData: false,
  ddlSkipAutoIncrementPk: false,
  ddlMode: 'full',
  ddlFromVersionId: null,
  ddlToVersionId: null,
  showMinimap: true,
  searchQuery: '',

  selectTable: (id) => set({ selectedTableId: id, selectedRelationId: null, selectedRegionId: null }),
  selectRelation: (id) => set({ selectedRelationId: id, selectedTableId: null, selectedRegionId: null }),
  selectRegion: (id) => set({ selectedRegionId: id, selectedTableId: null, selectedRelationId: null }),
  openDictionary: () => set({ isDictionaryOpen: true }),
  closeDictionary: () => set({ isDictionaryOpen: false }),
  openCsvImport: () => set({ isCsvImportOpen: true }),
  closeCsvImport: () => set({ isCsvImportOpen: false }),
  openVersions: () => set({ isVersionsOpen: true }),
  closeVersions: () => set({ isVersionsOpen: false }),
  openDdl: (ddl) => set({ isDdlOpen: true, lastDdl: ddl }),
  closeDdl: () => set({ isDdlOpen: false }),
  setDialect: (dialect) => set({ dialect }),
  setDdlOptions: (insertSeedData, skipAutoIncrementPk) => set({ ddlInsertSeedData: insertSeedData, ddlSkipAutoIncrementPk: skipAutoIncrementPk }),
  setDdlMode: (mode) => set({ ddlMode: mode }),
  setDdlVersions: (fromVersionId, toVersionId) => set({ ddlFromVersionId: fromVersionId, ddlToVersionId: toVersionId }),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
