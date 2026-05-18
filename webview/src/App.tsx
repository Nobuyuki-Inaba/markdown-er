import { useEffect, useCallback } from 'react';
import { useDiagramStore } from './store/diagramStore';
import { useUiStore } from './store/uiStore';
import { sendToExtension, onMessageFromExtension } from './vscodeApi';
import { Toolbar } from './components/Toolbar';
import { DiagramCanvas } from './components/DiagramCanvas';
import { TableEditPanel } from './components/TableEditPanel';
import { RelationEditPanel } from './components/RelationEditPanel';
import { DictionaryPanel } from './components/DictionaryPanel';

export function App() {
  const setModel   = useDiagramStore((s) => s.setModel);
  const model      = useDiagramStore((s) => s.model);
  const saveVersion = useDiagramStore((s) => s.saveVersion);
  const openDdl    = useUiStore((s) => s.openDdl);
  const isDdlOpen  = useUiStore((s) => s.isDdlOpen);
  const closeDdl   = useUiStore((s) => s.closeDdl);
  const lastDdl    = useUiStore((s) => s.lastDdl);

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
        const { selectedTableId, selectedRelationId } = useUiStore.getState();
        if (selectedTableId) {
          useDiagramStore.getState().deleteTable(selectedTableId);
          useUiStore.getState().selectTable(null);
        } else if (selectedRelationId) {
          useDiagramStore.getState().deleteRelation(selectedRelationId);
          useUiStore.getState().selectRelation(null);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // DDL export request from toolbar
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode: 'full' | 'diff' };
      sendToExtension({ type: 'requestDdl', payload: { mode: detail.mode } });
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
        {isDdlOpen && (
          <DdlModal ddl={lastDdl} onClose={closeDdl} />
        )}
      </div>
    </div>
  );
}

function DdlModal({ ddl, onClose }: { ddl: string; onClose: () => void }) {
  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(ddl).catch(() => {});
  }, [ddl]);

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #333' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Generated DDL</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyToClipboard} style={{ ...modalBtnStyle, background: '#4a7c9e' }}>Copy</button>
            <button onClick={onClose} style={{ ...modalBtnStyle, background: '#555' }}>Close</button>
          </div>
        </div>
        <pre style={{ flex: 1, overflowY: 'auto', margin: 0, padding: 14, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {ddl}
        </pre>
      </div>
    </div>
  );
}

const modalBtnStyle: React.CSSProperties = {
  border: 'none', borderRadius: 4, padding: '4px 10px',
  color: '#fff', cursor: 'pointer', fontSize: 12,
};
