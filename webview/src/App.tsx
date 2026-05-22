import { useEffect, useCallback } from 'react';
import { useDiagramStore } from './store/diagramStore';
import { useUiStore } from './store/uiStore';
import { sendToExtension, onMessageFromExtension } from './vscodeApi';
import { Toolbar } from './components/Toolbar';
import { DiagramCanvas } from './components/DiagramCanvas';
import { TableEditPanel } from './components/TableEditPanel';
import { RelationEditPanel } from './components/RelationEditPanel';
import { DictionaryPanel } from './components/DictionaryPanel';
import { CsvImportPanel } from './components/CsvImportPanel';
import { VersionsPanel } from './components/VersionsPanel';

export function App() {
  const setModel   = useDiagramStore((s) => s.setModel);
  const model      = useDiagramStore((s) => s.model);
  const saveVersion = useDiagramStore((s) => s.saveVersion);
  const openDdl    = useUiStore((s) => s.openDdl);
  const isDdlOpen  = useUiStore((s) => s.isDdlOpen);
  const closeDdl   = useUiStore((s) => s.closeDdl);
  const lastDdl    = useUiStore((s) => s.lastDdl);
  const setDialect = useUiStore((s) => s.setDialect);

  // Listen for messages from the extension host
  useEffect(() => {
    const unlisten = onMessageFromExtension((msg) => {
      switch (msg.type) {
        case 'load':
          setModel(msg.payload);
          break;
        case 'fileChanged':
          // External edit: merge or replace
          setModel(msg.payload);
          break;
        case 'ddlResult':
          openDdl(msg.payload.ddl);
          break;
        case 'versionSaved':
          setModel(msg.payload);
          break;
        case 'dialectChanged':
          setDialect(msg.payload.dialect);
          break;
        case 'undo':
          useDiagramStore.temporal.getState().undo();
          break;
        case 'redo':
          useDiagramStore.temporal.getState().redo();
          break;
      }
    });

    // Signal readiness to the extension
    sendToExtension({ type: 'ready' });

    return unlisten;
  }, []);

  // Debounced auto-save: send model to extension on any change
  useEffect(() => {
    if (saveVersion === 0) return; // skip initial load
    const timer = setTimeout(() => {
      sendToExtension({ type: 'save', payload: model, version: saveVersion });
    }, 300);
    return () => clearTimeout(timer);
  }, [saveVersion]);

  // Keyboard shortcuts: undo/redo + Delete selected
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't intercept keys while the user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useDiagramStore.temporal.getState().undo();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || (e.key === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        useDiagramStore.temporal.getState().redo();
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
      const { ddlInsertSeedData, ddlSkipAutoIncrementPk, ddlFromVersionId, ddlToVersionId } = useUiStore.getState();
      sendToExtension({
        type: 'requestDdl',
        payload: {
          mode: detail.mode,
          ...(detail.mode === 'version-diff' ? { fromVersionId: ddlFromVersionId ?? undefined, toVersionId: ddlToVersionId } : {}),
          insertSeedData: ddlInsertSeedData,
          skipAutoIncrementPk: ddlSkipAutoIncrementPk,
        },
      });
    };
    window.addEventListener('er:requestDdl', handler);
    return () => window.removeEventListener('er:requestDdl', handler);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Toolbar />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        <DiagramCanvas />
        <TableEditPanel />
        <RelationEditPanel />
        <DictionaryPanel />
        <CsvImportPanel />
        <VersionsPanel />
        {isDdlOpen && (
          <DdlModal ddl={lastDdl} onClose={closeDdl} />
        )}
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

  const handleInsertChange = (checked: boolean) => {
    setDdlOptions(checked, checked ? skipAutoIncrementPk : false);
    window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: ddlMode } }));
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

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(ddl).catch(() => {});
  }, [ddl]);

  const hasVersions = schemaVersions.length > 0;

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
          <span style={{ fontWeight: 700, fontSize: 14 }}>Generated DDL</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyToClipboard} style={{ ...modalBtnStyle, background: '#4a7c9e' }}>Copy</button>
            <button onClick={onClose} style={{ ...modalBtnStyle, background: '#555' }}>Close</button>
          </div>
        </div>

        {/* mode selector */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #2a2a2a', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={optionLabelStyle}>
            <input type="radio" name="ddlMode" checked={ddlMode === 'full'} onChange={() => handleModeChange('full')} style={{ marginRight: 5 }} />
            Full DDL
          </label>
          <label style={{ ...optionLabelStyle, opacity: hasVersions ? 1 : 0.4 }}>
            <input type="radio" name="ddlMode" checked={ddlMode === 'version-diff'} disabled={!hasVersions} onChange={() => handleModeChange('version-diff')} style={{ marginRight: 5 }} />
            Version Diff
          </label>
          {!hasVersions && <span style={{ fontSize: 11, color: '#777' }}>（バージョンを保存すると比較できます）</span>}
        </div>

        {/* version diff controls */}
        {ddlMode === 'version-diff' && hasVersions && (
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #2a2a2a', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#aaa' }}>From:</span>
            <select
              value={ddlFromVersionId ?? ''}
              onChange={(e) => handleFromChange(e.target.value)}
              style={selectStyle}
            >
              <option value="" disabled>選択…</option>
              {schemaVersions.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({formatDate(v.date)})</option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: '#aaa' }}>To:</span>
            <select
              value={ddlToVersionId ?? '__current__'}
              onChange={(e) => handleToChange(e.target.value === '__current__' ? null : e.target.value)}
              style={selectStyle}
            >
              <option value="__current__">現在の状態</option>
              {schemaVersions.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({formatDate(v.date)})</option>
              ))}
            </select>
          </div>
        )}

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
              Include seed data as INSERT statements
            </label>
            <label style={{ ...optionLabelStyle, opacity: insertSeedData ? 1 : 0.4, pointerEvents: insertSeedData ? 'auto' : 'none' }}>
              <input
                type="checkbox"
                checked={skipAutoIncrementPk}
                disabled={!insertSeedData}
                onChange={(e) => handleSkipPkChange(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Skip auto-increment PK columns
            </label>
          </div>
        )}

        <pre style={{ flex: 1, overflowY: 'auto', margin: 0, padding: 14, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {ddl}
        </pre>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
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
