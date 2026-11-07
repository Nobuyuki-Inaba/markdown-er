import { useEffect, useCallback, useRef } from 'react';
import { useDiagramStore, loadModel, setSchemaVersions, applyHistory } from './store/diagramStore';
import { useUiStore } from './store/uiStore';
import { sendToExtension, onMessageFromExtension } from './vscodeApi';
import { Toolbar } from './components/Toolbar';
import { DdlReplacementsEditor } from './components/DdlReplacementsEditor';
import { CanvasToolbar } from './components/CanvasToolbar';
import { DiagramCanvas } from './components/DiagramCanvas';
import { TableEditPanel } from './components/TableEditPanel';
import { RelationEditPanel } from './components/RelationEditPanel';
import { DictionaryPanel } from './components/DictionaryPanel';
import { ColumnSetPanel } from './components/ColumnSetPanel';
import { CsvImportPanel } from './components/CsvImportPanel';
import { SqlImportPanel } from './components/SqlImportPanel';
import { VersionsPanel } from './components/VersionsPanel';
import { DatabasePanel } from './components/DatabasePanel';
import { useMessages, formatDateTime } from './i18n';
import { DdlStyle, DDL_STYLE_KEYS } from '@shared/ddlStyle';

export function App() {
  const model      = useDiagramStore((s) => s.model);
  const saveVersion = useDiagramStore((s) => s.saveVersion);
  const openDdl    = useUiStore((s) => s.openDdl);
  const isDdlOpen  = useUiStore((s) => s.isDdlOpen);
  const closeDdl   = useUiStore((s) => s.closeDdl);
  const lastDdl    = useUiStore((s) => s.lastDdl);
  const setDialect = useUiStore((s) => s.setDialect);
  const setLocale  = useUiStore((s) => s.setLocale);
  const fileStatus = useUiStore((s) => s.fileStatus);
  const messages   = useMessages();
  const fileUriRef   = useRef('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Listen for messages from the extension host
  useEffect(() => {
    const unlisten = onMessageFromExtension((msg) => {
      switch (msg.type) {
        case 'load':
        case 'fileChanged':
          // An edit still waiting to be sent belongs to the previous file contents
          clearTimeout(saveTimerRef.current);
          useUiStore.getState().setSaveState('saved');
          if (msg.type === 'load') fileUriRef.current = msg.fileUri;
          // Replace the model and drop undo history so Ctrl+Z can't go back to a different file state
          loadModel(msg.payload);
          break;
        case 'saveStatus':
          // An older version's result says nothing about the latest edit
          if (msg.payload.version >= useDiagramStore.getState().saveVersion) {
            useUiStore.getState().setSaveState(msg.payload.ok ? 'saved' : 'failed');
          }
          break;
        case 'ddlResult':
          openDdl(msg.payload.ddl, msg.payload.data, msg.payload.errors);
          break;
        case 'fileStatus':
          useUiStore.getState().setFileStatus(msg.payload);
          break;
        case 'versionSaved':
          // Only versions changed; keep any in-flight diagram edits
          setSchemaVersions(msg.payload.schemaVersions);
          break;
        case 'dialectChanged':
          setDialect(msg.payload.dialect);
          break;
        case 'localeChanged':
          setLocale(msg.payload.locale, msg.payload.setting);
          break;
        case 'ddlStyleChanged': {
          useUiStore.getState().setDdlStyle(msg.payload);
          // Regenerate the open DDL with the new style
          const { isDdlOpen, ddlMode } = useUiStore.getState();
          if (isDdlOpen) window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: ddlMode } }));
          break;
        }
        case 'undo':
          applyHistory('undo');
          break;
        case 'redo':
          applyHistory('redo');
          break;
      }
    });

    // Signal readiness to the extension
    sendToExtension({ type: 'ready' });

    return unlisten;
  }, []);

  // Debounced auto-save: send model to extension on any change
  const pendingSaveRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (saveVersion === 0) return; // skip initial load
    // Capture the file now: a file switch may happen before the timer fires
    const fileUri = fileUriRef.current;
    const send = () => {
      pendingSaveRef.current = null;
      sendToExtension({ type: 'save', payload: model, version: saveVersion, fileUri });
    };
    pendingSaveRef.current = send;
    useUiStore.getState().setSaveState('saving');
    saveTimerRef.current = setTimeout(send, 300);
    return () => { clearTimeout(saveTimerRef.current); pendingSaveRef.current = null; };
  }, [saveVersion]);
  // Send the pending save now (before a request that reads the saved model)
  const flushSave = () => {
    clearTimeout(saveTimerRef.current);
    pendingSaveRef.current?.();
  };
  // Ctrl+S: skip the debounce on both sides. Nothing to do once saved, so an untouched file keeps its bytes.
  const saveNow = () => {
    if (useUiStore.getState().saveState === 'saved') return;
    clearTimeout(saveTimerRef.current);
    pendingSaveRef.current = null;
    const { model, saveVersion } = useDiagramStore.getState();
    sendToExtension({ type: 'save', payload: model, version: saveVersion, fileUri: fileUriRef.current, immediate: true });
  };

  // Keyboard shortcuts: undo/redo + Delete selected
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't intercept keys while the user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Leave Ctrl+Z / Ctrl+Y to the browser's text undo while typing
      const key = e.key.toLowerCase();
      // Works while typing too: inputs update the model on every keystroke
      if ((e.ctrlKey || e.metaKey) && key === 's' && !e.shiftKey) {
        e.preventDefault();
        saveNow();
      }
      if (!isEditing && (e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        applyHistory('undo');
      }
      if (
        !isEditing &&
        (e.ctrlKey || e.metaKey) &&
        (key === 'y' || (key === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        applyHistory('redo');
      }

      if (!isEditing && e.key === 'Delete') {
        const { selectedTableId, selectedRelationId, selectedRegionId } = useUiStore.getState();
        if (selectedTableId) {
          useDiagramStore.getState().deleteTable(selectedTableId);
          useUiStore.getState().selectTable(null);
        } else if (selectedRelationId) {
          useDiagramStore.getState().deleteRelation(selectedRelationId);
          useUiStore.getState().selectRelation(null);
        } else if (selectedRegionId) {
          useDiagramStore.getState().deleteRegion(selectedRegionId);
          useUiStore.getState().selectRegion(null);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // DDL export request from toolbar or DDL modal
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode: 'full' | 'diff' | 'version-diff' };
      flushSave();
      const { ddlInsertSeedData, ddlSkipAutoIncrementPk, ddlIncludeCreateDatabase, ddlFromVersionId, ddlToVersionId } = useUiStore.getState();
      sendToExtension({
        type: 'requestDdl',
        payload: {
          mode: detail.mode,
          ...(detail.mode === 'version-diff' ? { fromVersionId: ddlFromVersionId ?? undefined, toVersionId: ddlToVersionId } : {}),
          insertSeedData: ddlInsertSeedData,
          skipAutoIncrementPk: ddlSkipAutoIncrementPk,
          includeCreateDatabase: ddlIncludeCreateDatabase,
        },
      });
    };
    window.addEventListener('er:requestDdl', handler);
    return () => window.removeEventListener('er:requestDdl', handler);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Toolbar />
      {fileStatus.readOnly && (
        <div role="alert" style={readOnlyBannerStyle}>
          {messages.file.readOnly(fileStatus.formatVersion, fileStatus.supportedVersion)}
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <CanvasToolbar />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
          <DiagramCanvas />
          <TableEditPanel />
          <RelationEditPanel />
          <DictionaryPanel />
          <ColumnSetPanel />
          <CsvImportPanel />
          <SqlImportPanel />
          <VersionsPanel />
          <DatabasePanel />
          {isDdlOpen && (
            <DdlModal ddl={lastDdl} onClose={closeDdl} />
          )}
        </div>
      </div>
    </div>
  );
}

function DdlModal({ ddl, onClose }: { ddl: string; onClose: () => void }) {
  const insertSeedData      = useUiStore((s) => s.ddlInsertSeedData);
  const skipAutoIncrementPk = useUiStore((s) => s.ddlSkipAutoIncrementPk);
  const ddlMode             = useUiStore((s) => s.ddlMode);
  const ddlFromVersionId    = useUiStore((s) => s.ddlFromVersionId);
  const ddlToVersionId      = useUiStore((s) => s.ddlToVersionId);
  const setDdlOptions       = useUiStore((s) => s.setDdlOptions);
  const setDdlMode          = useUiStore((s) => s.setDdlMode);
  const setDdlVersions      = useUiStore((s) => s.setDdlVersions);
  const schemaVersions      = useDiagramStore((s) => s.model.schemaVersions ?? []);
  const includeCreateDatabase    = useUiStore((s) => s.ddlIncludeCreateDatabase);
  const setIncludeCreateDatabase = useUiStore((s) => s.setIncludeCreateDatabase);
  const locale              = useUiStore((s) => s.locale);
  const ddlStyle            = useUiStore((s) => s.ddlStyle);
  const messages = useMessages();
  const t = messages.ddl;

  const handleInsertChange = (checked: boolean) => {
    setDdlOptions(checked, checked ? skipAutoIncrementPk : false);
    window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: ddlMode } }));
  };

  const handleCreateDatabaseChange = (checked: boolean) => {
    setIncludeCreateDatabase(checked);
    window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: ddlMode } }));
  };

  // Written to the settings by the extension host; ddlStyleChanged then regenerates the DDL
  const handleStyleChange = (key: keyof DdlStyle, checked: boolean) => {
    sendToExtension({ type: 'setDdlStyle', payload: { [key]: checked } });
  };

  const handleSkipPkChange = (checked: boolean) => {
    setDdlOptions(insertSeedData, checked);
    window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: ddlMode } }));
  };

  const handleModeChange = (mode: 'full' | 'version-diff') => {
    setDdlMode(mode);
    if (mode === 'full') {
      window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: 'full' } }));
    } else if (schemaVersions.length > 0) {
      const firstId = ddlFromVersionId ?? schemaVersions[0].id;
      setDdlVersions(firstId, ddlToVersionId);
      window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: 'version-diff' } }));
    }
  };

  const handleFromChange = (id: string) => {
    setDdlVersions(id, ddlToVersionId);
    window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: 'version-diff' } }));
  };

  const handleToChange = (id: string | null) => {
    setDdlVersions(ddlFromVersionId, id);
    window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: 'version-diff' } }));
  };

  const data = useUiStore((s) => s.lastDdlData);
  const errors = useUiStore((s) => s.lastDdlErrors);
  const blocked = errors.length > 0;
  const saveFile = (kind: 'ddl' | 'data') =>
    sendToExtension({ type: 'saveSqlFile', payload: { kind, text: kind === 'ddl' ? ddl : data } });

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(ddl).catch(() => {});
  }, [ddl]);

  const hasVersions = schemaVersions.length > 0;

  // Rules are applied by the extension host: regenerate once typing pauses (the request flushes the save first)
  const replacements = useDiagramStore((s) => s.model.ddlReplacements);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const timer = setTimeout(() => window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: ddlMode } })), 400);
    return () => clearTimeout(timer);
  }, [replacements]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#0007', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1e1e1e', color: '#d4d4d4', borderRadius: 6,
        width: '80vw', maxWidth: 800, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px #0008',
      }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #333' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{t.title}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => saveFile('ddl')} disabled={blocked} style={{ ...modalBtnStyle, background: '#4a7c9e', opacity: blocked ? 0.4 : 1 }} title={t.saveDdlTitle}>{t.saveDdl}</button>
            <button
              onClick={() => saveFile('data')}
              disabled={!data}
              style={{ ...modalBtnStyle, background: '#4a7c9e', opacity: data ? 1 : 0.4, cursor: data ? 'pointer' : 'default' }}
              title={data ? t.saveDataTitle : t.saveDataNone}
            >
              {t.saveData}
            </button>
            <button onClick={copyToClipboard} disabled={blocked} style={{ ...modalBtnStyle, background: '#4a7c9e', opacity: blocked ? 0.4 : 1 }}>{t.copy}</button>
            <button onClick={onClose} style={{ ...modalBtnStyle, background: '#555' }}>{messages.common.close}</button>
          </div>
        </div>

        {/* mode selector */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #2a2a2a', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={optionLabelStyle}>
            <input type="radio" name="ddlMode" checked={ddlMode === 'full'} onChange={() => handleModeChange('full')} style={{ marginRight: 5 }} />
            {t.full}
          </label>
          <label style={{ ...optionLabelStyle, opacity: hasVersions ? 1 : 0.4 }}>
            <input type="radio" name="ddlMode" checked={ddlMode === 'version-diff'} disabled={!hasVersions} onChange={() => handleModeChange('version-diff')} style={{ marginRight: 5 }} />
            {t.versionDiff}
          </label>
          {!hasVersions && <span style={{ fontSize: 11, color: '#777' }}>{t.versionDiffHint}</span>}
        </div>

        {/* version diff controls */}
        {ddlMode === 'version-diff' && hasVersions && (
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #2a2a2a', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#aaa' }}>{t.from}</span>
            <select
              value={ddlFromVersionId ?? ''}
              onChange={(e) => handleFromChange(e.target.value)}
              style={selectStyle}
            >
              <option value="" disabled>{t.select}</option>
              {schemaVersions.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({formatDateTime(v.date, locale)})</option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: '#aaa' }}>{t.to}</span>
            <select
              value={ddlToVersionId ?? '__current__'}
              onChange={(e) => handleToChange(e.target.value === '__current__' ? null : e.target.value)}
              style={selectStyle}
            >
              <option value="__current__">{t.current}</option>
              {schemaVersions.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({formatDateTime(v.date, locale)})</option>
              ))}
            </select>
          </div>
        )}

        {/* Format (applies to full and diff DDL) */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #2a2a2a', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#aaa' }}>{t.format}</span>
          {DDL_STYLE_KEYS.map((key) => (
            <label key={key} style={optionLabelStyle} title={t.styleHints[key]}>
              <input
                type="checkbox"
                checked={ddlStyle[key]}
                onChange={(e) => handleStyleChange(key, e.target.checked)}
                style={{ marginRight: 5 }}
              />
              {t.styleLabels[key]}
            </label>
          ))}
        </div>

        {/* INSERT options */}
        {ddlMode === 'full' && (
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #2a2a2a', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <label style={optionLabelStyle}>
              <input
                type="checkbox"
                checked={insertSeedData}
                onChange={(e) => handleInsertChange(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              {t.insertSeedData}
            </label>
            <label style={{ ...optionLabelStyle, opacity: insertSeedData ? 1 : 0.4, pointerEvents: insertSeedData ? 'auto' : 'none' }}>
              <input
                type="checkbox"
                checked={skipAutoIncrementPk}
                disabled={!insertSeedData}
                onChange={(e) => handleSkipPkChange(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              {t.skipAutoIncrementPk}
            </label>
            <label style={optionLabelStyle}>
              <input
                type="checkbox"
                checked={includeCreateDatabase}
                onChange={(e) => handleCreateDatabaseChange(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              {t.includeCreateDatabase}
            </label>
          </div>
        )}

        <DdlReplacementsEditor />

        {blocked ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, fontSize: 12 }}>
            <div style={{ color: '#f48771', fontWeight: 700, marginBottom: 6 }}>{t.validationFailed}</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.map((e, i) => <li key={i}>{t.validationErrors[e.code](e.table, e.column ?? '')}</li>)}
            </ul>
          </div>
        ) : (
          <pre style={{ flex: 1, overflowY: 'auto', margin: 0, padding: 14, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {ddl}
          </pre>
        )}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: '#2a2a2a', color: '#ddd', border: '1px solid #555',
  borderRadius: 3, padding: '3px 6px', fontSize: 12,
};

const modalBtnStyle: React.CSSProperties = {
  border: 'none', borderRadius: 4, padding: '4px 10px',
  color: '#fff', cursor: 'pointer', fontSize: 12,
};

const optionLabelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', fontSize: 12, color: '#ccc', cursor: 'pointer', userSelect: 'none',
};

const readOnlyBannerStyle: React.CSSProperties = {
  background: '#fff4ce',
  borderBottom: '1px solid #e0c060',
  color: '#5c4400',
  fontSize: 12,
  padding: '6px 12px',
};
