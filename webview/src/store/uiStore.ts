import { create } from 'zustand';
import type { DdlDialect, LanguageSetting, Locale } from '@shared/messages';
import { DdlStyle, DEFAULT_DDL_STYLE } from '@shared/ddlStyle';
import type { ValidationError } from '@shared/validation';

export type SaveState = 'saved' | 'saving' | 'failed';

interface UiState {
  selectedTableId: string | null;
  selectedRelationId: string | null;
  selectedRegionId: string | null;
  isDictionaryOpen: boolean;
  isColumnSetsOpen: boolean;
  isCsvImportOpen: boolean;
  isVersionsOpen: boolean;
  isDdlOpen: boolean;
  lastDdl: string;
  /** Seed-data INSERTs alone (full mode), for "Save data…" */
  lastDdlData: string;
  /** Why the DDL could not be generated */
  lastDdlErrors: ValidationError[];
  dialect: DdlDialect;
  locale: Locale;
  languageSetting: LanguageSetting;
  isDatabaseOpen: boolean;
  ddlInsertSeedData: boolean;
  ddlIncludeCreateDatabase: boolean;
  /** Mirror of the markdown-er.ddl.* settings (owned by the extension host) */
  ddlStyle: DdlStyle;
  ddlSkipAutoIncrementPk: boolean;
  ddlMode: 'full' | 'version-diff';
  ddlFromVersionId: string | null;
  ddlToVersionId: string | null;
  showMinimap: boolean;
  searchQuery: string;
  /** Whether the latest edit is on disk */
  saveState: SaveState;
  /** From the extension host (`fileStatus`): the file's format is newer than the extension */
  fileStatus: { readOnly: boolean; formatVersion: number; supportedVersion: number };

  selectTable: (id: string | null) => void;
  selectRelation: (id: string | null) => void;
  selectRegion: (id: string | null) => void;
  openDictionary: () => void;
  closeDictionary: () => void;
  openColumnSets: () => void;
  closeColumnSets: () => void;
  openCsvImport: () => void;
  closeCsvImport: () => void;
  openVersions: () => void;
  closeVersions: () => void;
  openDdl: (ddl: string, data?: string, errors?: ValidationError[]) => void;
  closeDdl: () => void;
  setDialect: (dialect: DdlDialect) => void;
  setLocale: (locale: Locale, setting: LanguageSetting) => void;
  openDatabase: () => void;
  closeDatabase: () => void;
  setIncludeCreateDatabase: (include: boolean) => void;
  setDdlStyle: (style: DdlStyle) => void;
  setDdlOptions: (insertSeedData: boolean, skipAutoIncrementPk: boolean) => void;
  setDdlMode: (mode: 'full' | 'version-diff') => void;
  setDdlVersions: (fromVersionId: string | null, toVersionId: string | null) => void;
  toggleMinimap: () => void;
  setSearchQuery: (query: string) => void;
  setSaveState: (saveState: SaveState) => void;
  setFileStatus: (status: UiState['fileStatus']) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  selectedTableId: null,
  selectedRelationId: null,
  selectedRegionId: null,
  isDictionaryOpen: false,
  isColumnSetsOpen: false,
  isCsvImportOpen: false,
  isVersionsOpen: false,
  isDdlOpen: false,
  lastDdl: '',
  lastDdlData: '',
  lastDdlErrors: [],
  dialect: 'mysql',
  locale: 'en',
  languageSetting: 'auto',
  isDatabaseOpen: false,
  ddlInsertSeedData: false,
  ddlIncludeCreateDatabase: false,
  ddlStyle: DEFAULT_DDL_STYLE,
  ddlSkipAutoIncrementPk: false,
  ddlMode: 'full',
  ddlFromVersionId: null,
  ddlToVersionId: null,
  showMinimap: true,
  searchQuery: '',
  saveState: 'saved',
  fileStatus: { readOnly: false, formatVersion: 0, supportedVersion: 0 },

  selectTable: (id) => set({ selectedTableId: id, selectedRelationId: null, selectedRegionId: null }),
  selectRelation: (id) => set({ selectedRelationId: id, selectedTableId: null, selectedRegionId: null }),
  selectRegion: (id) => set({ selectedRegionId: id, selectedTableId: null, selectedRelationId: null }),
  openDictionary: () => set({ isDictionaryOpen: true }),
  closeDictionary: () => set({ isDictionaryOpen: false }),
  openColumnSets: () => set({ isColumnSetsOpen: true }),
  closeColumnSets: () => set({ isColumnSetsOpen: false }),
  openCsvImport: () => set({ isCsvImportOpen: true }),
  closeCsvImport: () => set({ isCsvImportOpen: false }),
  openVersions: () => set({ isVersionsOpen: true }),
  closeVersions: () => set({ isVersionsOpen: false }),
  openDdl: (ddl, data = '', errors = []) => set({ isDdlOpen: true, lastDdl: ddl, lastDdlData: data, lastDdlErrors: errors }),
  closeDdl: () => set({ isDdlOpen: false }),
  setDialect: (dialect) => set({ dialect }),
  setLocale: (locale, languageSetting) => set({ locale, languageSetting }),
  openDatabase: () => set({ isDatabaseOpen: true }),
  closeDatabase: () => set({ isDatabaseOpen: false }),
  setIncludeCreateDatabase: (include) => set({ ddlIncludeCreateDatabase: include }),
  setDdlStyle: (style) => set({ ddlStyle: style }),
  setDdlOptions: (insertSeedData, skipAutoIncrementPk) => set({ ddlInsertSeedData: insertSeedData, ddlSkipAutoIncrementPk: skipAutoIncrementPk }),
  setDdlMode: (mode) => set({ ddlMode: mode }),
  setDdlVersions: (fromVersionId, toVersionId) => set({ ddlFromVersionId: fromVersionId, ddlToVersionId: toVersionId }),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSaveState: (saveState) => set({ saveState }),
  setFileStatus: (fileStatus) => set({ fileStatus }),
}));
